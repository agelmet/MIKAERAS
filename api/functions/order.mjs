// Cash on delivery and IRIS: checks the order, lowers stock, e-mails the shop and the customer.
import { cors, reply, loadShop, price, summary, lowerStock, mail, env, orderId } from '../lib/shop.mjs';

export default async (req) => {
  const H = cors(req.headers.get('origin'));
  if (req.method === 'OPTIONS') return new Response('', { headers: H });
  if (req.method !== 'POST') return reply(405, { error: 'POST only' }, H);
  try {
    const order = await req.json();
    order.pay = order.pay === 'iris' ? 'iris' : 'cod';
    const data = await loadShop();
    const pay = data.settings.payments || {};
    if (order.pay === 'cod' && !pay.cod) throw new Error('Η αντικαταβολή δεν είναι διαθέσιμη.');
    if (order.pay === 'iris' && !pay.iris) throw new Error('Η πληρωμή IRIS δεν είναι διαθέσιμη.');
    const c = order.customer || {};
    if (!c.name || !c.phone || !c.addr || !c.city || !c.zip) throw new Error('Λείπουν στοιχεία αποστολής.');
    const t = price(data, order);
    const id = orderId();
    const text = `Αριθμός παραγγελίας: ${id}\n\n` + summary(t, c);
    await lowerStock(t.lines.map((l) => ({ id: l.p.id, s: l.s, q: l.q }))).catch(() => {});
    const how = order.pay === 'iris' ? 'IRIS — αναμονή πληρωμής' : 'αντικαταβολή';
    await mail(env('ORDER_EMAIL', data.settings.email), `Νέα παραγγελία ${id} (${how}) — ${t.total.toFixed(2)}€`, text);
    const irisText = order.pay === 'iris'
      ? `\n\nΠληρωμή με IRIS:\n1. Ανοίξτε την εφαρμογή της τράπεζάς σας και επιλέξτε IRIS.\n2. Πληρωμή σε επιχείρηση: ${pay.irisId || ''}${pay.irisName ? ' (' + pay.irisName + ')' : ''}\n3. Ποσό: ${t.total.toFixed(2)}€\n4. Αιτιολογία: ${id}\nΗ παραγγελία κρατιέται 24 ώρες. Μόλις λάβουμε την πληρωμή, ξεκινά η αποστολή.`
      : '\n\nΘα επικοινωνήσουμε μαζί σας για την αποστολή.';
    if (c.email) await mail(c.email, `Η παραγγελία σας ${id} στη MIKAERAS`, `Ευχαριστούμε για την παραγγελία σας!\n\n${text}${irisText}`);
    return reply(200, { ok: true, orderId: id, total: t.total, summary: text }, H);
  } catch (e) {
    return reply(400, { error: e.message }, H);
  }
};
