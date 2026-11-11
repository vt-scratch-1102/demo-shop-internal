// Pressing Remove on a cart line must drop that line, update the Summary and the header
// count, and leave "Your cart is empty." when the last line goes. Run: node tests/cart-remove.test.js
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const assert = require("assert");

const root = path.join(__dirname, "..");
function load(file) { return fs.readFileSync(path.join(root, file), "utf8"); }

// Boots the shop on #/cart with the given cart, and returns a handle to press buttons in it.
function boot(cart) {
  const els = {};
  const el = (id) => (els[id] = els[id] || {
    id, innerHTML: "", textContent: "", classList: { add() {}, remove() {}, toggle() {} },
    setAttribute() {}, addEventListener(type, fn) { (this.listeners = this.listeners || {})[type] = fn; },
  });
  const ls = { "demoshop:cart": JSON.stringify(cart), "demoshop:user": JSON.stringify({ email: "alex@demoshop.test", name: "Alex Rivera" }) };
  const window = { scrollTo() {}, addEventListener() {} };
  const ctx = {
    window,
    document: { getElementById: el, querySelectorAll: () => [] },
    localStorage: { getItem: (k) => (k in ls ? ls[k] : null), setItem: (k, v) => { ls[k] = v; }, removeItem() {} },
    sessionStorage: { getItem: () => null, removeItem() {}, setItem() {} },
    location: { hash: "#/cart" },
    setTimeout, clearTimeout,
  };
  vm.createContext(ctx);
  vm.runInContext(load("products.js"), ctx);
  vm.runInContext(load("app.js"), ctx);

  // Press the first rendered button whose label matches, the way a click reaches the app's
  // delegated listener: the target's closest("button") carries the button's data-* attributes.
  function press(label) {
    const re = new RegExp("<button([^>]*)>\\s*" + label + "\\s*</button>");
    const m = els.app.innerHTML.match(re);
    if (!m) throw new Error('no "' + label + '" button on the page');
    const dataset = {};
    for (const a of m[1].matchAll(/data-([a-z-]+)="([^"]*)"/g)) {
      dataset[a[1].replace(/-([a-z])/g, (_, c) => c.toUpperCase())] = a[2];
    }
    const button = { dataset };
    els.app.listeners.click({ target: { closest: () => button } });
  }
  return {
    press,
    html: () => els.app.innerHTML,
    count: () => els["cart-count"].textContent,
    saved: () => JSON.parse(ls["demoshop:cart"]),
  };
}

let failed = 0;
function check(name, fn) {
  try { fn(); console.log("ok: " + name); } catch (e) { failed += 1; console.error("FAIL: " + name + " - " + e.message); }
}

check("Remove drops the line, the saved cart, the header count and the Summary", () => {
  const shop = boot([{ id: "notebook", qty: 2 }, { id: "mug", qty: 1 }]); // notebook $12.50 x 2, mug $18.00
  assert.match(shop.html(), /Linen Notebook/);
  shop.press("Remove"); // first line: the notebook
  assert.doesNotMatch(shop.html(), /Linen Notebook/);
  assert.match(shop.html(), /Stoneware Mug/);
  assert.deepStrictEqual(shop.saved(), [{ id: "mug", qty: 1 }]);
  assert.strictEqual(String(shop.count()), "1");
  assert.match(shop.html(), /id="subtotal">\$18\.00</);
  assert.match(shop.html(), /id="total">\$22\.99</); // under the free-shipping threshold: + $4.99
});

check("Removing the last line shows 'Your cart is empty.' and a zero count", () => {
  const shop = boot([{ id: "mug", qty: 1 }]);
  shop.press("Remove");
  assert.match(shop.html(), /Your cart is empty\./);
  assert.deepStrictEqual(shop.saved(), []);
  assert.strictEqual(String(shop.count()), "0");
});

if (failed) process.exit(1);
