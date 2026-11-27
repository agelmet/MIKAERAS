// Cash on delivery: checks the order, lowers stock, e-mails the shop and the customer.
import { cors, reply, loadShop, price, summary, lowerStock, mail, env } from '../lib/shop.mjs';

export default async (req) => {
  const H = cors(req.headers.get('origin'));
  if (req.method === 'OPTIONS') return new Response('', { headers: H });
  if (req.method !== 'POST') return reply(405, { error: 'POST only' }, H);
  try {
    const order = await req.json();
    order.pay = 'cod';
    const data = await loadShop();
    if (!(data.settings.payments && data.settings.payments.cod)) throw new Error('Η αντικαταβολή δεν είναι διαθέσιμη.');
    const c = order.customer || {};
    if (!c.name || !c.phone || !c.addr || !c.city || !c.zip) throw new Error('Λείπουν στοιχεία αποστολής.');
    const t = price(data, order);
    const text = summary(t, c);
    await lowerStock(t.lines.map((l) => ({ id: l.p.id, s: l.s, q: l.q }))).catch(() => {});
    await mail(env('ORDER_EMAIL', data.settings.email), `Νέα παραγγελία (αντικαταβολή) — ${t.total.toFixed(2)}€`, text);
    if (c.email) await mail(c.email, 'Η παραγγελία σας στη MIKAERAS', `Ευχαριστούμε για την παραγγελία σας!\n\n${text}\n\nΘα επικοινωνήσουμε μαζί σας για την αποστολή.`);
    return reply(200, { ok: true, summary: text }, H);
  } catch (e) {
    return reply(400, { error: e.message }, H);
  }
};
