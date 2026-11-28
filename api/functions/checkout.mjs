// Card payment: builds a secure payment page for the whole cart. Prices are recalculated here.
import { cors, reply, loadShop, price, stripe, env } from '../lib/shop.mjs';

export default async (req) => {
  const H = cors(req.headers.get('origin'));
  if (req.method === 'OPTIONS') return new Response('', { headers: H });
  if (req.method !== 'POST') return reply(405, { error: 'POST only' }, H);
  if (!env('STRIPE_SECRET_KEY')) return reply(503, { error: 'Οι πληρωμές με κάρτα δεν έχουν ενεργοποιηθεί ακόμα.' }, H);
  try {
    const order = await req.json();
    order.pay = 'card';
    const data = await loadShop();
    const t = price(data, order);
    const shop = env('SHOP_URL').replace(/\/$/, '');
    const c = order.customer || {};
    const params = {
      mode: 'payment', locale: 'el',
      success_url: `${shop}/?order=success`, cancel_url: `${shop}/`,
      customer_email: c.email || undefined,
      'payment_intent_data[shipping][name]': c.name, 'payment_intent_data[shipping][phone]': c.phone,
      'payment_intent_data[shipping][address][line1]': c.addr, 'payment_intent_data[shipping][address][city]': c.city,
      'payment_intent_data[shipping][address][postal_code]': c.zip, 'payment_intent_data[shipping][address][country]': 'GR',
      'metadata[items]': JSON.stringify(t.lines.map((l) => ({ id: l.p.id, s: l.s, q: l.q }))).slice(0, 500),
      'metadata[customer]': [c.name, c.phone, c.addr, c.city, c.zip].join(' | ').slice(0, 500),
      'metadata[note]': (c.note || '').slice(0, 500),
    };
    t.lines.forEach((l, i) => {
      params[`line_items[${i}][quantity]`] = l.q;
      params[`line_items[${i}][price_data][currency]`] = 'eur';
      params[`line_items[${i}][price_data][unit_amount]`] = Math.round(l.unit * 100);
      params[`line_items[${i}][price_data][product_data][name]`] = `${l.p.name} — ${l.s}`;
      if (l.p.images && l.p.images[0]) params[`line_items[${i}][price_data][product_data][images][0]`] = new URL(l.p.images[0], shop + '/').href;
    });
    if (t.discount > 0) {
      const cp = await stripe('coupons', { amount_off: Math.round(t.discount * 100), currency: 'eur', duration: 'once', name: t.labels.join(' + ').slice(0, 40) || 'Έκπτωση', max_redemptions: 1 });
      params['discounts[0][coupon]'] = cp.id;
    }
    params['shipping_options[0][shipping_rate_data][type]'] = 'fixed_amount';
    params['shipping_options[0][shipping_rate_data][display_name]'] = (t.ship ? '' : 'Δωρεάν · ') + t.shipName;
    params['metadata[ship]'] = t.shipName + (c.locker ? ' — θυρίδα: ' + c.locker : '');
    params['shipping_options[0][shipping_rate_data][fixed_amount][amount]'] = Math.round(t.ship * 100);
    params['shipping_options[0][shipping_rate_data][fixed_amount][currency]'] = 'eur';
    const s = await stripe('checkout/sessions', params);
    return reply(200, { url: s.url }, H);
  } catch (e) {
    return reply(400, { error: e.message }, H);
  }
};
