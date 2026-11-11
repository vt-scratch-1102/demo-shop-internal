// The cart Summary, the checkout button and the saved order must all price each line
// as unit price x quantity. Run: node tests/cart-totals.test.js
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const assert = require("assert");

const root = path.join(__dirname, "..");
function load(file) { return fs.readFileSync(path.join(root, file), "utf8"); }

function run(cart, hash) {
  const els = {};
  const el = (id) => (els[id] = els[id] || {
    id, innerHTML: "", textContent: "", classList: { add() {}, remove() {}, toggle() {} },
    setAttribute() {}, addEventListener() {},
  });
  const ls = { "demoshop:cart": JSON.stringify(cart), "demoshop:user": JSON.stringify({ email: "alex@demoshop.test", name: "Alex Rivera" }) };
  const window = { scrollTo() {}, addEventListener() {} };
  const ctx = {
    window,
    document: { getElementById: el, querySelectorAll: () => [] },
    localStorage: { getItem: (k) => (k in ls ? ls[k] : null), setItem: (k, v) => { ls[k] = v; }, removeItem() {} },
    sessionStorage: { getItem: () => null, removeItem() {}, setItem() {} },
    location: { hash },
    setTimeout, clearTimeout,
  };
  vm.createContext(ctx);
  vm.runInContext(load("products.js"), ctx);
  vm.runInContext(load("app.js"), ctx);
  return els.app.innerHTML;
}

let failed = 0;
function check(name, fn) {
  try { fn(); console.log("ok: " + name); } catch (e) { failed += 1; console.error("FAIL: " + name + " - " + e.message); }
}

check("cart summary multiplies by quantity (2 x $64.00, free shipping)", () => {
  const html = run([{ id: "lamp", qty: 2 }], "#/cart");
  assert.match(html, /id="subtotal">\$128\.00</);
  assert.match(html, /id="total">\$128\.00</);
});

check("cart summary sums several lines with quantities and adds shipping under $50", () => {
  // 3 x $12.50 = 37.50 + 1 x $18.00 = 18.00 -> 55.50 (free shipping)
  assert.match(run([{ id: "notebook", qty: 3 }, { id: "mug", qty: 1 }], "#/cart"), /id="total">\$55\.50</);
  // 2 x $12.50 = 25.00 + $4.99 shipping
  const html = run([{ id: "notebook", qty: 2 }], "#/cart");
  assert.match(html, /id="subtotal">\$25\.00</);
  assert.match(html, /id="total">\$29\.99</);
});

check("free-shipping threshold counts quantities (2 x $24 pays shipping, 3 x $24 ships free)", () => {
  // 2 x $24.00 fern = 48.00 -> under threshold, +4.99 shipping; 3 x $24.00 = 72.00 -> free
  assert.match(run([{ id: "plant", qty: 2 }], "#/cart"), /id="total">\$52\.99</);
  assert.match(run([{ id: "plant", qty: 3 }], "#/cart"), /id="total">\$72\.00</);
});

check("checkout button shows the quantity-weighted total", () => {
  assert.match(run([{ id: "lamp", qty: 2 }], "#/checkout"), /Place order · \$128\.00/);
});

if (failed) process.exit(1);
