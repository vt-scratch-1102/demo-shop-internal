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
      // A CommonJS package imported from ESM can expose its exports only on `default`.
      const api = mod && mod.chromium ? mod : mod && mod.default;
      if (api && api.chromium) return api;
    } catch {
      // try the next candidate
    }
  }
  return null;
}

const playwright = await resolvePlaywright();

// Walk the shop the way a shopper does: sign in, add a mug, check out, land on
// the thank-you page. Returns the order number the shop issued.
async function placeOrder(page, baseUrl) {
  await page.goto(`${baseUrl}/index.html#/`, { waitUntil: "domcontentloaded" });
  await page.evaluate(() =>
    localStorage.setItem("demoshop:user", JSON.stringify({ email: "alex@demoshop.test", name: "Alex Rivera" }))
  );
  // The shop reads the signed-in user once at load, so a reload is how it picks the seed up.
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.goto(`${baseUrl}/index.html#/product/mug`, { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "Add to cart" }).click();

  await page.goto(`${baseUrl}/index.html#/checkout`, { waitUntil: "domcontentloaded" });
  await page.locator('input[name="address"]').fill("12 Harbour Lane");
  await page.locator('input[name="city"]').fill("Springfield");
  await page.locator('input[name="postcode"]').fill("40123");
  await page.locator('input[name="card"]').fill("4242 4242 4242 4242");
  await page.getByRole("button", { name: /^Place order/ }).click();

  await page.waitForFunction(() => location.hash.startsWith("#/done/"));
  const number = await page.locator(".empty strong").innerText();
  assert.match(number, /^DS-\d{6}$/, `unexpected order number "${number}"`);
  return number;
}

function orderCount(page) {
  return page.evaluate(() => JSON.parse(localStorage.getItem("demoshop:orders:alex@demoshop.test") || "[]").length);
}

function boxesOverlap(a, b) {
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
}

if (!playwright) {
  test.skip("playwright not available: install playwright or set PLAYWRIGHT_MODULE", () => {});
} else {
  test("the thank-you page offers Continue shopping beside See my orders", async (t) => {
    const { server, port } = await startServer();
    t.after(() => new Promise((resolve) => server.close(resolve)));
    const baseUrl = `http://127.0.0.1:${port}`;

    const browser = await playwright.chromium.launch({ args: ["--no-sandbox"] });
    t.after(() => browser.close());

    for (const viewport of [
      { width: 1280, height: 720 },
      { width: 375, height: 812 },
    ]) {
      await t.test(`${viewport.width}x${viewport.height}`, async () => {
        const page = await browser.newPage({ viewport });
        try {
          const number = await placeOrder(page, baseUrl);

          // The rest of the page is unchanged.
          await assert.equal(await page.locator(".empty h1").innerText(), "Thank you!");
          const message = await page.locator(".empty p").innerText();
          assert.equal(message, `Your order ${number} is placed.`);

          // Both actions are on the page, next to each other, fully visible.
          const continueLink = page.getByRole("link", { name: "Continue shopping" });
          const ordersLink = page.getByRole("link", { name: "See my orders" });
          await assert.equal(await continueLink.count(), 1, "expected exactly one Continue shopping link");
          await assert.equal(await ordersLink.count(), 1, "expected exactly one See my orders link");
          assert.equal(await continueLink.getAttribute("href"), "#/");
          assert.equal(await ordersLink.getAttribute("href"), "#/orders");

          const continueBox = await continueLink.boundingBox();
          const ordersBox = await ordersLink.boundingBox();
          assert.ok(continueBox, "Continue shopping has no box");
          assert.ok(ordersBox, "See my orders has no box");
          assert.ok(!boxesOverlap(continueBox, ordersBox), "the two actions overlap each other");

          const page_ = await page.evaluate(() => ({
            innerWidth: window.innerWidth,
            scrollWidth: document.documentElement.scrollWidth,
          }));
          assert.ok(
            page_.scrollWidth <= page_.innerWidth + 1,
            `the page scrolls sideways at ${viewport.width}px (scrollWidth ${page_.scrollWidth} > ${page_.innerWidth})`
          );
          for (const [label, box] of [
            ["Continue shopping", continueBox],
            ["See my orders", ordersBox],
          ]) {
            assert.ok(box.x >= 0, `${label} starts left of the screen at ${viewport.width}px (x ${box.x})`);
            assert.ok(
              box.x + box.width <= page_.innerWidth + 1,
              `${label} runs past the right edge at ${viewport.width}px (${box.x + box.width} > ${page_.innerWidth})`
            );
          }

          if (viewport.width >= 760) {
            // On a wide screen the brief asks for the two actions beside each other.
            const sameRow = continueBox.y < ordersBox.y + ordersBox.height && ordersBox.y < continueBox.y + continueBox.height;
            assert.ok(sameRow, "the two actions are not on the same row on a desktop width");
          }
        } finally {
          await page.close();
        }
      });
    }
  });

  test("Continue shopping returns to the shop and places no order", async (t) => {
    const { server, port } = await startServer();
    t.after(() => new Promise((resolve) => server.close(resolve)));
    const baseUrl = `http://127.0.0.1:${port}`;

    const browser = await playwright.chromium.launch({ args: ["--no-sandbox"] });
    t.after(() => browser.close());

    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    try {
      const number = await placeOrder(page, baseUrl);
      assert.equal(await orderCount(page), 1, "the order was not saved");

      await page.getByRole("link", { name: "Continue shopping" }).click();
      await page.waitForFunction(() => location.hash === "#/" || location.hash === "");

      // The shop home opens with the six products, each with its price and its button.
      await page.waitForFunction(() => document.querySelectorAll(".card").length === 6);
      const cards = page.locator(".card");
      assert.equal(await cards.count(), 6, "expected six product cards");
      for (let i = 0; i < 6; i += 1) {
        const card = cards.nth(i);
        const name = await card.locator(".card-title").innerText();
        assert.match(
          await card.locator(".card-price").innerText(),
          /^\$\d+\.\d{2}$/,
          `card ${i} (${name}): price is missing or malformed`
        );
        assert.equal(await card.getByRole("button", { name: "Add to cart" }).count(), 1, `card ${i} (${name}): no Add to cart`);
      }

      // The basket starts empty, and browsing the shop places nothing.
      assert.equal((await page.locator("#cart-count").innerText()).trim(), "0", "the header cart count is not 0");
      assert.equal(await orderCount(page), 1, "Continue shopping created another order");

      // A second purchase starts from an empty basket and leaves the first order alone.
      await cards.first().getByRole("button", { name: "Add to cart" }).click();
      await cards.first().getByRole("button", { name: "Add to cart" }).click();
      await page.goto(`${baseUrl}/index.html#/cart`, { waitUntil: "domcontentloaded" });
      const lines = page.locator(".line");
      assert.equal(await lines.count(), 1, "the cart should hold only the mug");
      assert.equal((await page.locator(".line-name").innerText()).trim(), "Stoneware Mug");
      assert.equal((await page.locator(".qty-n").innerText()).trim(), "2");

      // My orders still lists the order exactly once.
      await page.goto(`${baseUrl}/index.html#/orders`, { waitUntil: "domcontentloaded" });
      const orders = page.locator(".order");
      assert.equal(await orders.count(), 1, "expected exactly one order");
      assert.equal(await orderCount(page), 1, "expected exactly one saved order");
      assert.match(await orders.first().locator("strong").innerText(), new RegExp(`^${number}$`));
    } finally {
      await page.close();
    }
  });

  test("See my orders still opens My orders from the thank-you page", async (t) => {
    const { server, port } = await startServer();
    t.after(() => new Promise((resolve) => server.close(resolve)));
    const baseUrl = `http://127.0.0.1:${port}`;

    const browser = await playwright.chromium.launch({ args: ["--no-sandbox"] });
    t.after(() => browser.close());

    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    try {
      const number = await placeOrder(page, baseUrl);
      await page.getByRole("link", { name: "See my orders" }).click();
      await page.waitForFunction(() => location.hash === "#/orders");
      await page.waitForSelector(".order");

      const orders = page.locator(".order");
      assert.equal(await orders.count(), 1, "expected exactly one order in My orders");
      assert.equal((await orders.first().locator("strong").innerText()).trim(), number);
    } finally {
      await page.close();
    }
  });
}
