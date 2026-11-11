// Every element the app renders or toggles with the `hidden` attribute must actually disappear.
// A class rule that sets `display` (e.g. `.empty { display: flex }`) overrides the browser's
// default `[hidden] { display: none }`, so each such class needs its own `.cls[hidden]` rule.
// Run: node tests/hidden-elements.test.js
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const css = fs.readFileSync(path.join(root, "styles.css"), "utf8");
const sources = ["app.js", "index.html"].map((f) => fs.readFileSync(path.join(root, f), "utf8")).join("\n");

// Classes of elements that carry a literal `hidden` attribute in the markup.
const hiddenClasses = new Set();
for (const m of sources.matchAll(/<[^>]*\sclass="([^"]*)"[^>]*\shidden(?=[\s>=])[^>]*>/g)) {
  m[1].split(/\s+/).filter(Boolean).forEach((c) => hiddenClasses.add(c));
}

const rules = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({ sel: m[1].trim(), body: m[2] }));
let failed = 0;
for (const cls of hiddenClasses) {
  const setsDisplay = rules.some((r) => new RegExp(`(^|[\\s,>+~])\\.${cls}(?![\\w-])(?!\\[hidden\\])`).test(r.sel) && /(^|;|\s)display\s*:/.test(r.body) && !/\[hidden\]/.test(r.sel));
  const guarded = rules.some((r) => r.sel.split(",").some((s) => s.trim().endsWith(`.${cls}[hidden]`)) && /display\s*:\s*none/.test(r.body));
  if (setsDisplay && !guarded) {
    failed += 1;
    console.error(`FAIL: .${cls} sets display but has no .${cls}[hidden] { display: none } rule — hidden elements stay visible`);
  } else {
    console.log(`ok: .${cls}`);
  }
}
if (hiddenClasses.size === 0) { console.error("FAIL: found no hidden elements to check — the test is out of date"); failed += 1; }
process.exit(failed ? 1 : 0);
