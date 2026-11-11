import assert from "node:assert/strict";
import { createServer } from "node:http";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import test from "node:test";

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const CONTENT_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
};

function startServer() {
  const server = createServer((req, res) => {
    let pathname;
    try {
      pathname = decodeURIComponent(new URL(req.url, "http://127.0.0.1").pathname);
    } catch {
      res.writeHead(400).end("Bad request");
      return;
    }
    const relative = pathname === "/" ? "index.html" : pathname.replace(/^\/+/, "");
    const filePath = path.resolve(ROOT, relative);
    if (filePath !== ROOT && !filePath.startsWith(ROOT + path.sep)) {
      res.writeHead(403).end("Forbidden");
      return;
    }
    try {
      if (!statSync(filePath).isFile()) throw new Error("not a file");
      const body = readFileSync(filePath);
      res.writeHead(200, {
        "content-type": CONTENT_TYPES[path.extname(filePath).toLowerCase()] || "application/octet-stream",
        "content-length": body.length,
      });
      res.end(body);
    } catch {
      res.writeHead(404).end("Not found");
    }
  });
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      resolve({ server, port: server.address().port });
    });
  });
}

function npxPlaywrightCandidates() {
  const base = path.join(homedir(), ".npm", "_npx");
  if (!existsSync(base)) return [];
  return readdirSync(base)
    .map((entry) => path.join(base, entry, "node_modules", "playwright"))
    .filter((candidate) => existsSync(candidate));
}

async function loadPlaywright(candidate) {
  let resolved = candidate;
  if (path.isAbsolute(candidate) || candidate.startsWith(".")) {
    resolved = path.resolve(candidate);
    if (statSync(resolved).isDirectory()) resolved = require.resolve(resolved);
  } else {
    resolved = require.resolve(candidate);
  }
  return import(pathToFileURL(resolved).href);
}

async function resolvePlaywright() {
  const candidates = [];
  if (process.env.PLAYWRIGHT_MODULE) candidates.push(process.env.PLAYWRIGHT_MODULE);
  try {
    candidates.push(require.resolve("playwright"));
  } catch {
    // not installed in the project; fall through to the npx cache
  }
  candidates.push(...npxPlaywrightCandidates());

  for (const candidate of candidates) {
    try {
      const mod = await loadPlaywright(candidate);
      if (mod && mod.chromium) return mod;
      // Playwright is CommonJS; under ESM import() its exports can land on `default`.
      if (mod && mod.default && mod.default.chromium) return mod.default;
    } catch {
      // try the next candidate
    }
  }
  return null;
}

const playwright = await resolvePlaywright();

if (!playwright) {
  test.skip("playwright not available: install playwright or set PLAYWRIGHT_MODULE", () => {});
} else {
  test("shop cards keep each price below the product name and the name readable", async (t) => {
    const { server, port } = await startServer();
    t.after(() => new Promise((resolve) => server.close(resolve)));

    const browser = await playwright.chromium.launch({ args: ["--no-sandbox"] });
    t.after(() => browser.close());

    for (const viewport of [
      { width: 1280, height: 720 },
      { width: 390, height: 844 },
    ]) {
      await t.test(`${viewport.width}x${viewport.height}`, async () => {
        const page = await browser.newPage({ viewport });
        try {
          await page.goto(`http://127.0.0.1:${port}/index.html#/`, { waitUntil: "domcontentloaded" });
          await page.waitForFunction(() => document.querySelectorAll(".card").length === 6);

          const cards = page.locator(".card");
          await assert.equal(await cards.count(), 6, "expected six product cards");

          for (let i = 0; i < 6; i += 1) {
            const card = cards.nth(i);
            await card.evaluate((el) => el.scrollIntoView({ block: "center", inline: "nearest" }));
            await page.waitForTimeout(50);

            const name = await card.locator(".card-title").innerText();
            const title = await card.locator(".card-title").boundingBox();
            const price = await card.locator(".card-price").boundingBox();
            assert.ok(title, `card ${i} (${name}): title has no box`);
            assert.ok(price, `card ${i} (${name}): price has no box`);

            const separated =
              price.x + price.width <= title.x ||
              price.x >= title.x + title.width ||
              price.y + price.height <= title.y ||
              price.y >= title.y + title.height;
            assert.ok(
              separated,
              `card ${i} (${name}): price rect ${JSON.stringify(price)} intersects title rect ${JSON.stringify(title)}`
            );

            assert.ok(
              price.y >= title.y + title.height - 1,
              `card ${i} (${name}): price top ${price.y} is above title bottom ${title.y + title.height}`
            );

            // The name's first characters must not be covered by the price (or anything else).
            const startPoint = await page.evaluate(
              ({ x, y }) => {
                const el = document.elementFromPoint(x, y);
                return el
                  ? {
                      tag: el.tagName,
                      className: typeof el.className === "string" ? el.className : "",
                      inTitle: Boolean(el.closest(".card-title")),
                      inPrice: Boolean(el.closest(".card-price")),
                    }
                  : null;
              },
              { x: title.x + 2, y: title.y + title.height / 2 }
            );
            assert.ok(startPoint, `card ${i} (${name}): no element at the title's text start`);
            assert.ok(
              startPoint.inTitle && !startPoint.inPrice,
              `card ${i} (${name}): title text start resolves to <${startPoint.tag} class="${startPoint.className}"> instead of the title`
            );

            // Every horizontal slice of the title's own line must resolve to the title, not the price.
            const hitPoints = await page.evaluate(
              ({ left, top, width, height }) => {
                const ys = [top + height / 2];
                const xs = [left + 2, left + width * 0.25, left + width * 0.5, left + width * 0.75, left + width - 2];
                const hits = [];
                for (const y of ys) {
                  for (const x of xs) {
                    const el = document.elementFromPoint(x, y);
                    hits.push({
                      x,
                      y,
                      inTitle: Boolean(el && el.closest(".card-title")),
                      inPrice: Boolean(el && el.closest(".card-price")),
                      tag: el ? el.tagName : null,
                    });
                  }
                }
                return hits;
              },
              { left: title.x, top: title.y, width: title.width, height: title.height }
            );
            for (const hit of hitPoints) {
              assert.ok(
                hit.inTitle && !hit.inPrice,
                `card ${i} (${name}): point (${hit.x}, ${hit.y}) on the title line is covered by <${hit.tag}>`
              );
            }
          }
        } finally {
          await page.close();
        }
      });
    }
  });
}
