// Demo Shop: a tiny single-page store. Hash routes, state in localStorage.
(function () {
  "use strict";

  const app = document.getElementById("app");
  const money = (n) => "$" + n.toFixed(2);
  const byId = (id) => window.PRODUCTS.find((p) => p.id === id);

  // ---- state ---------------------------------------------------------------
  const store = {
    get(key, fallback) {
      try {
        const raw = localStorage.getItem("demoshop:" + key);
        return raw ? JSON.parse(raw) : fallback;
      } catch (e) {
        return fallback;
      }
    },
    set(key, value) {
      try {
        localStorage.setItem("demoshop:" + key, JSON.stringify(value));
      } catch (e) {
        /* private mode: the shop still works for this visit */
      }
    },
  };

  let cart = store.get("cart", []); // [{ id, qty }]
  let user = store.get("user", null); // { email, name }

  function saveCart() {
    store.set("cart", cart);
    renderHeader();
  }

  function addToCart(id) {
    const line = cart.find((l) => l.id === id);
    if (line) line.qty += 1;
    else cart.push({ id, qty: 1 });
    saveCart();
    toast(byId(id).name + " added to your cart");
  }

  function setQty(id, qty) {
    const line = cart.find((l) => l.id === id);
    if (!line) return;
    line.qty = Math.max(1, Math.min(99, qty));
    saveCart();
  }

  function removeFromCart(id) {
    cart = cart.filter((l) => l.id !== id);
    saveCart();
  }

  function totals() {
    const subtotal = cart.reduce((sum, l) => sum + byId(l.id).price, 0);
    const shipping = cart.length === 0 || subtotal >= window.FREE_SHIPPING_FROM ? 0 : window.SHIPPING;
    return { subtotal, shipping, total: subtotal + shipping };
  }

  // ---- ui helpers ----------------------------------------------------------
  let toastTimer = null;
  function toast(text) {
    const el = document.getElementById("toast");
    el.textContent = text;
    el.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove("show"), 2200);
  }

  function esc(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  function renderHeader() {
    const count = cart.reduce((n, l) => n + l.qty, 0);
    document.getElementById("cart-count").textContent = count;
    const who = document.getElementById("who");
    const auth = document.getElementById("auth-link");
    if (user) {
      who.textContent = "Hi, " + user.name.split(" ")[0];
      auth.textContent = "Sign out";
      auth.setAttribute("href", "#/logout");
    } else {
      who.textContent = "";
      auth.textContent = "Sign in";
      auth.setAttribute("href", "#/login");
    }
    const route = location.hash.replace(/^#\/?/, "").split("/")[0] || "shop";
    document.querySelectorAll("[data-nav]").forEach((a) => {
      a.classList.toggle("active", a.dataset.nav === route);
    });
  }

  function tile(p, size) {
    return `<div class="tile tile-${size}" style="background:${p.color}" aria-hidden="true"><span>${p.icon}</span></div>`;
  }

  // ---- pages ---------------------------------------------------------------
  function shopPage() {
    const cards = window.PRODUCTS.map(
      (p) => `
      <article class="card" data-name="${esc(p.name.toLowerCase())}">
        <a href="#/product/${p.id}" class="card-link">
          ${tile(p, "md")}
          <h3 class="card-title">${esc(p.name)}</h3>
          <span class="card-price">${money(p.price)}</span>
        </a>
        <button class="btn btn-primary btn-block" data-add="${p.id}">Add to cart</button>
      </article>`
    ).join("");
    return `
      <section class="hero">
        <h1>Small things for a calmer desk</h1>
        <p>Free shipping on orders over ${money(window.FREE_SHIPPING_FROM)}.</p>
      </section>
      <div class="search">
        <label class="sr-only" for="search">Search products</label>
        <input id="search" type="search" placeholder="Search products" autocomplete="off">
      </div>
      <section class="grid" aria-label="Products">${cards}</section>
      <p id="no-match" class="empty" hidden>No products match your search.</p>`;
  }

  function productPage(id) {
    const p = byId(id);
    if (!p) return notFound();
    return `
      <a class="back" href="#/">← Back to the shop</a>
      <section class="product">
        ${tile(p, "lg")}
        <div class="product-info">
          <h1>${esc(p.name)}</h1>
          <p class="product-price">${money(p.price)}</p>
          <p class="muted">${esc(p.blurb)}</p>
          <button class="btn btn-primary" data-add="${p.id}">Add to cart</button>
        </div>
      </section>`;
  }

  function cartPage() {
    if (cart.length === 0) {
      return `
        <h1>Your cart</h1>
        <div class="empty">
          <p>Your cart is empty.</p>
          <a class="btn btn-primary" href="#/">Browse the shop</a>
        </div>`;
    }
    const rows = cart
      .map((l) => {
        const p = byId(l.id);
        return `
        <li class="line">
          ${tile(p, "sm")}
          <div class="line-main">
            <a href="#/product/${p.id}" class="line-name">${esc(p.name)}</a>
            <span class="muted">${money(p.price)} each</span>
          </div>
          <div class="qty" aria-label="Quantity for ${esc(p.name)}">
            <button class="btn btn-icon" data-dec="${p.id}" aria-label="One less">−</button>
            <span class="qty-n">${l.qty}</span>
            <button class="btn btn-icon" data-inc="${p.id}" aria-label="One more">+</button>
          </div>
          <span class="line-total">${money(p.price * l.qty)}</span>
          <button class="btn btn-link" data-id="${p.id}" data-action="remove">Remove</button>
        </li>`;
      })
      .join("");
    const t = totals();
    return `
      <h1>Your cart</h1>
      <div class="cart-layout">
        <ul class="lines">${rows}</ul>
        ${summary(t)}
      </div>
      <div class="cart-actions">
        <a class="btn btn-ghost" href="#/">Keep shopping</a>
        <a class="btn btn-primary" href="#/checkout">Go to checkout</a>
      </div>`;
  }

  function summary(t) {
    return `
      <aside class="summary" aria-label="Order summary">
        <h2>Summary</h2>
        <dl>
          <div><dt>Subtotal</dt><dd id="subtotal">${money(t.subtotal)}</dd></div>
          <div><dt>Shipping</dt><dd>${t.shipping === 0 ? "Free" : money(t.shipping)}</dd></div>
          <div class="total"><dt>Total</dt><dd id="total">${money(t.total)}</dd></div>
        </dl>
      </aside>`;
  }

  function checkoutPage() {
    if (!user) {
      sessionStorage.setItem("demoshop:after-login", "#/checkout");
      return `
        <h1>Checkout</h1>
        <div class="empty">
          <p>Please sign in to check out.</p>
          <a class="btn btn-primary" href="#/login">Sign in</a>
        </div>`;
    }
    if (cart.length === 0) {
      return `<h1>Checkout</h1><div class="empty"><p>Your cart is empty.</p><a class="btn btn-primary" href="#/">Browse the shop</a></div>`;
    }
    const t = totals();
    return `
      <h1>Checkout</h1>
      <div class="cart-layout">
        <form id="checkout-form" class="form" novalidate>
          <label>Full name<input name="name" autocomplete="name" value="${esc(user.name)}" required></label>
          <label>Street address<input name="address" autocomplete="street-address" required></label>
          <div class="row">
            <label>City<input name="city" autocomplete="address-level2" required></label>
            <label>Postcode<input name="postcode" autocomplete="postal-code" required></label>
          </div>
          <label>Card number<input name="card" inputmode="numeric" placeholder="4242 4242 4242 4242" required></label>
          <p class="muted small">This is a demo. Use any number of 16 digits; nothing is charged.</p>
          <p id="form-error" class="error" role="alert"></p>
          <button class="btn btn-primary btn-block" type="submit">Place order · ${money(t.total)}</button>
        </form>
        ${summary(t)}
      </div>`;
  }

  function placeOrder(form) {
    const data = Object.fromEntries(new FormData(form).entries());
    const err = form.querySelector("#form-error");
    const missing = ["name", "address", "city", "postcode", "card"].filter((k) => !String(data[k] || "").trim());
    if (missing.length) {
      err.textContent = "Please fill in every field.";
      return;
    }
    if (String(data.card).replace(/\s+/g, "").length !== 16) {
      err.textContent = "The card number needs 16 digits.";
      return;
    }
    const t = totals();
    const orders = store.get("orders:" + user.email, []);
    const number = "DS-" + String(Date.now()).slice(-6);
    orders.unshift({
      number,
      date: new Date().toISOString(),
      lines: cart.map((l) => ({ id: l.id, qty: l.qty, price: byId(l.id).price })),
      total: t.total,
    });
    store.set("orders:" + user.email, orders);
    cart = [];
    saveCart();
    location.hash = "#/done/" + number;
  }

  function donePage(number) {
    return `
      <div class="empty">
        <h1>Thank you!</h1>
        <p>Your order <strong>${esc(number)}</strong> is placed.</p>
        <a class="btn btn-primary" href="#/orders">See my orders</a>
      </div>`;
  }

  function ordersPage() {
    if (!user) {
      sessionStorage.setItem("demoshop:after-login", "#/orders");
      return `<h1>My orders</h1><div class="empty"><p>Sign in to see your orders.</p><a class="btn btn-primary" href="#/login">Sign in</a></div>`;
    }
    const orders = store.get("orders:" + user.email, []);
    if (orders.length === 0) {
      return `<h1>My orders</h1><div class="empty"><p>No orders yet.</p><a class="btn btn-primary" href="#/">Start shopping</a></div>`;
    }
    const items = orders
      .map(
        (o) => `
        <li class="order">
          <div><strong>${esc(o.number)}</strong><span class="muted"> · ${new Date(o.date).toLocaleDateString()}</span></div>
          <div class="muted">${o.lines.map((l) => esc(byId(l.id).name) + " × " + l.qty).join(", ")}</div>
          <div class="order-total">${money(o.total)}</div>
        </li>`
      )
      .join("");
    return `<h1>My orders</h1><ul class="orders">${items}</ul>`;
  }

  function loginPage() {
    return `
      <div class="auth">
        <h1>Sign in</h1>
        <form id="login-form" class="form" novalidate>
          <label>Email<input name="email" type="email" autocomplete="username" required></label>
          <label>Password<input name="password" type="password" autocomplete="current-password" required></label>
          <p id="login-error" class="error" role="alert"></p>
          <button class="btn btn-primary btn-block" type="submit">Sign in</button>
        </form>
      </div>`;
  }

  function login(form) {
    const email = String(form.email.value).trim().toLowerCase();
    const password = String(form.password.value);
    const account = window.ACCOUNTS.find((a) => a.email === email && a.password === password);
    if (!account) {
      form.querySelector("#login-error").textContent = "That email and password don't match an account.";
      return;
    }
    user = { email: account.email, name: account.name };
    store.set("user", user);
    const next = sessionStorage.getItem("demoshop:after-login") || "#/";
    sessionStorage.removeItem("demoshop:after-login");
    toast("Signed in as " + account.name);
    location.hash = next;
  }

  function notFound() {
    return `<div class="empty"><h1>Page not found</h1><a class="btn btn-primary" href="#/">Back to the shop</a></div>`;
  }

  // ---- router --------------------------------------------------------------
  function route() {
    const [page, arg] = location.hash.replace(/^#\/?/, "").split("/");
    if (page === "logout") {
      user = null;
      store.set("user", null);
      toast("Signed out");
      location.hash = "#/";
      return;
    }
    const pages = {
      "": shopPage,
      product: () => productPage(arg),
      cart: cartPage,
      checkout: checkoutPage,
      done: () => donePage(arg),
      orders: ordersPage,
      login: loginPage,
    };
    app.innerHTML = (pages[page] || notFound)();
    renderHeader();
    window.scrollTo(0, 0);
  }

  // ---- events --------------------------------------------------------------
  app.addEventListener("click", (e) => {
    const t = e.target.closest("button");
    if (!t) return;
    if (t.dataset.add) addToCart(t.dataset.add);
    else if (t.dataset.inc) { const l = cart.find((x) => x.id === t.dataset.inc); setQty(l.id, l.qty + 1); route(); }
    else if (t.dataset.dec) { const l = cart.find((x) => x.id === t.dataset.dec); setQty(l.id, l.qty - 1); route(); }
    else if (t.dataset.remove) { removeFromCart(t.dataset.remove); route(); }
  });

  // Product search: filters the shop's cards by name as the shopper types.
  app.addEventListener("input", (e) => {
    if (e.target.id !== "search") return;
    const q = e.target.value.trim().toLowerCase();
    let shown = 0;
    document.querySelectorAll(".grid .card").forEach((card) => {
      const match = card.dataset.name.includes(q);
      card.hidden = !match;
      if (match) shown += 1;
    });
    document.getElementById("no-match").hidden = shown > 0;
  });

  app.addEventListener("submit", (e) => {
    e.preventDefault();
    if (e.target.id === "login-form") login(e.target);
    if (e.target.id === "checkout-form") placeOrder(e.target);
  });

  window.addEventListener("hashchange", route);
  route();
})();
