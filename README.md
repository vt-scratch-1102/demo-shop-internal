# Demo Shop

A small made-up web shop used to try [Vibe Test](https://vibe-test.tech). Nothing here is real:
no products ship, no card is charged, and there is no server.

- **Shop**: six products, product pages, a cart with quantities.
- **Checkout**: sign in, fill an address and any 16-digit card number, place the order.
- **My orders**: the orders placed by the signed-in account (kept in the browser).

## Test accounts

| Email | Password |
| --- | --- |
| alex@demoshop.test | shop1234 |
| sam@demoshop.test | shop1234 |

## Run it

Static files only: open `index.html`, or serve the folder (`npx serve .`).

## Deploy

Every push to `main` deploys to GitHub Pages through `.github/workflows/deploy.yml`.
