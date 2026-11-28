# MIKAERAS shop — how it runs

- **Shop**: `index.html` + `products.json` (all products, prices, stock, discounts, settings). Hosted free on GitHub Pages.
- **Admin**: `admin.html` — edits `products.json` and uploads photos straight to this repo («Δημοσίευση»). Free, live in ~1 minute.
- **Payments**: `api/` — a small separate Netlify site (deploy once). It is the only part that needs Stripe.

## Turning on real payments (the only step left)
1. Shop owner creates a Stripe account (ID + IBAN) and sends the **secret key** (`sk_live_…`).
2. New Netlify site from this repo, **base directory `api`**. Add the environment variables listed in `api/netlify.toml`.
3. Stripe → Developers → Webhooks → add `https://<api-site>/.netlify/functions/stripe-webhook`, event `checkout.session.completed` → copy the signing secret into `STRIPE_WEBHOOK_SECRET`.
4. Admin → Ρυθμίσεις → «Σύνδεση πληρωμών» → paste `https://<api-site>` → Δημοσίευση.

From then on: card payments for the whole cart (discounts + shipping recalculated on the server), cash-on-delivery orders, stock lowers itself after every sale, order e-mails to the shop and the customer.

## Publishing key for the owner's phone
GitHub → Settings → Developer settings → Fine-grained token → only this repo → Contents: Read and write. Paste it once in the admin when it asks.

## Notes (v4)
- Discount codes are stored as slow salted hashes (PBKDF2). The shop page, the admin and `api/lib/shop.mjs` must use the same function.
- The admin reads the newest `products.json` straight from the repo once the publishing key is set, and keeps unpublished photos in the phone's IndexedDB.
- The admin can be added to the phone's home screen (`admin.webmanifest`).

## Shipping & IRIS (v5)
- Shipping methods live in `settings.shippingMethods` (BOX NOW, FedEx, 2,99€, 2–5 days); editable in Admin → Ρυθμίσεις. Free over `freeShipping`.
- IRIS (mandatory for B2C since 1 Dec 2025): customer pays from their bank app to the shop's IRIS ID (ΑΦΜ/κινητό, set in Admin → Ρυθμίσεις → Πληρωμές). The order arrives by e-mail as "αναμονή πληρωμής" with an order number used as the payment reference; the owner ships once the money is in.
