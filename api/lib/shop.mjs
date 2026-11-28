import crypto from 'node:crypto';

export const env = (k, d = '') => process.env[k] || d;
const SHOP = () => env('SHOP_URL').replace(/\/$/, '');

export function cors(origin) {
  const allowed = SHOP() ? new URL(SHOP()).origin : '*';
  return {
    'Access-Control-Allow-Origin': origin && (allowed === '*' || origin === allowed) ? origin : allowed,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json',
  };
}
export const reply = (status, body, headers) => new Response(JSON.stringify(body), { status, headers });

export async function loadShop() {
  const r = await fetch(`${SHOP()}/products.json?v=${Date.now()}`, { cache: 'no-store' });
  if (!r.ok) throw new Error('products.json not reachable');
  return r.json();
}

const live = (dt) => !dt || new Date(dt).getTime() > Date.now();
const r2 = (n) => Math.round(n * 100) / 100;
export function unitPrice(p, s) {
  if (p.sale && p.sale < p.price && live(p.saleEnds)) return p.sale;
  const sw = s.sitewide;
  if (sw && sw.active && live(sw.ends) && sw.percent > 0) return r2(p.price * (100 - sw.percent) / 100);
  return p.price;
}
const sha = (t) => crypto.pbkdf2Sync(t, 'mikaeras-codes-v1', 150000, 32, 'sha256').toString('hex');

/* Same rules as the shop page. Prices always come from products.json, never from the browser. */
export function price(data, order) {
  const s = data.settings || {};
  const lines = [];
  for (const it of order.items || []) {
    const p = (data.products || []).find((x) => x.id === it.id && x.active !== false);
    if (!p) throw new Error('Ένα προϊόν δεν είναι πια διαθέσιμο. Ανανεώστε τη σελίδα.');
    const size = (p.sizes || []).find((z) => z.s === it.s);
    const q = Math.max(1, Math.floor(+it.q || 0));
    if (!size || +size.q < q) throw new Error(`Το «${p.name}» (${it.s}) δεν έχει πια αρκετά τεμάχια.`);
    lines.push({ p, s: it.s, q, unit: unitPrice(p, s) });
  }
  if (!lines.length) throw new Error('Το καλάθι είναι άδειο.');
  const items = lines.reduce((a, l) => a + l.q, 0);
  const sub = r2(lines.reduce((a, l) => a + l.unit * l.q, 0));
  let auto = 0, labels = [];
  const qd = s.qtyDiscount;
  if (qd && qd.active && items >= (qd.min || 2) && qd.percent > 0) { auto = r2(sub * qd.percent / 100); labels.push(`${qd.min}+ κομμάτια −${qd.percent}%`); }
  let codeAmt = 0, freeShip = false;
  if (order.code) {
    const h = sha(String(order.code).trim().toUpperCase());
    const c = (s.codes || []).find((x) => x.h === h && x.active !== false && live(x.ends));
    const base = sub - auto;
    if (c && !(c.min && base < c.min)) {
      if (c.type === 'percent') codeAmt = r2(base * c.value / 100);
      else if (c.type === 'amount') codeAmt = Math.min(base, c.value);
      else if (c.type === 'freeship') freeShip = true;
      labels.push(`Κωδικός ${String(order.code).toUpperCase()}`);
    }
  }
  const after = Math.max(0, r2(sub - auto - codeAmt));
  const ship = after >= (s.freeShipping ?? 69) || freeShip ? 0 : (s.shippingCost ?? 4);
  const cod = order.pay === 'cod' ? ((s.payments && s.payments.codFee) || 0) : 0;
  return { lines, sub, discount: r2(auto + codeAmt), labels, ship, cod, total: r2(after + ship + cod), settings: s };
}

export function summary(t, customer = {}) {
  const L = t.lines.map((l) => `${l.q} × ${l.p.name} (${l.s}) — ${(l.unit * l.q).toFixed(2)}€`).join('\n');
  return `${L}\nΈκπτωση: −${t.discount.toFixed(2)}€ ${t.labels.join(', ')}\nΑποστολή: ${t.ship.toFixed(2)}€${t.cod ? `\nΑντικαταβολή: ${t.cod.toFixed(2)}€` : ''}\nΣΥΝΟΛΟ: ${t.total.toFixed(2)}€\n\n${customer.name || ''}\n${customer.phone || ''} · ${customer.email || ''}\n${customer.addr || ''}, ${customer.city || ''} ${customer.zip || ''}${customer.note ? `\nΣημείωση: ${customer.note}` : ''}`;
}

/* Lower stock in products.json on GitHub (the shop updates itself in about a minute, at no cost). */
export async function lowerStock(items) {
  const tok = env('GITHUB_TOKEN'), repo = env('GITHUB_REPO'), br = env('GITHUB_BRANCH', 'main');
  if (!tok || !repo) return false;
  const url = `https://api.github.com/repos/${repo}/contents/products.json`;
  const H = { Authorization: `Bearer ${tok}`, Accept: 'application/vnd.github+json', 'User-Agent': 'mikaeras-shop' };
  for (let attempt = 0; attempt < 4; attempt++) {
    const g = await fetch(`${url}?ref=${br}`, { headers: H });
    if (!g.ok) throw new Error('GitHub read ' + g.status);
    const f = await g.json();
    const data = JSON.parse(Buffer.from(f.content, 'base64').toString('utf8'));
    for (const it of items) {
      const p = data.products.find((x) => x.id === it.id);
      const z = p && p.sizes.find((x) => x.s === it.s);
      if (z) z.q = Math.max(0, (+z.q || 0) - (+it.q || 0));
    }
    const put = await fetch(url, { method: 'PUT', headers: H, body: JSON.stringify({
      message: 'Πώληση: ενημέρωση τεμαχίων', branch: br, sha: f.sha,
      content: Buffer.from(JSON.stringify(data, null, 1)).toString('base64') }) });
    if (put.ok) return true;
    if (put.status !== 409 && put.status !== 422) throw new Error('GitHub write ' + put.status);
  }
  return false;
}

export async function mail(to, subject, text) {
  const key = env('RESEND_API_KEY');
  if (!key || !to) return;
  await fetch('https://api.resend.com/emails', { method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: env('FROM_EMAIL', 'MIKAERAS <onboarding@resend.dev>'), to: [to], subject, text }) }).catch(() => {});
}

export async function stripe(path, params) {
  const body = new URLSearchParams();
  const add = (k, v) => {
    if (v === undefined || v === null || v === '') return;
    if (typeof v === 'object') Object.entries(v).forEach(([kk, vv]) => add(`${k}[${kk}]`, vv));
    else body.append(k, String(v));
  };
  Object.entries(params).forEach(([k, v]) => add(k, v));
  const r = await fetch(`https://api.stripe.com/v1/${path}`, { method: 'POST',
    headers: { Authorization: `Bearer ${env('STRIPE_SECRET_KEY')}`, 'Content-Type': 'application/x-www-form-urlencoded' }, body });
  const j = await r.json();
  if (!r.ok) throw new Error(j.error && j.error.message || 'Stripe error');
  return j;
}

export function verifyStripe(raw, header, secret) {
  const parts = Object.fromEntries(String(header || '').split(',').map((kv) => kv.split('=')));
  if (!parts.t || !parts.v1) return false;
  if (Math.abs(Date.now() / 1000 - +parts.t) > 600) return false;
  const exp = crypto.createHmac('sha256', secret).update(`${parts.t}.${raw}`).digest('hex');
  try { return crypto.timingSafeEqual(Buffer.from(exp), Buffer.from(parts.v1)); } catch { return false; }
}
