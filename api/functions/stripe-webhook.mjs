// After a card payment succeeds: lower stock and send the order e-mails.
import { verifyStripe, lowerStock, mail, env, loadShop } from '../lib/shop.mjs';

export default async (req) => {
  const raw = await req.text();
  if (!verifyStripe(raw, req.headers.get('stripe-signature'), env('STRIPE_WEBHOOK_SECRET'))) return new Response('bad signature', { status: 400 });
  const ev = JSON.parse(raw);
  if (ev.type === 'checkout.session.completed') {
    const s = ev.data.object, m = s.metadata || {};
    let items = []; try { items = JSON.parse(m.items || '[]'); } catch {}
    await lowerStock(items).catch(() => {});
    let to = env('ORDER_EMAIL'); if (!to) { try { to = (await loadShop()).settings.email; } catch {} }
    const total = ((s.amount_total || 0) / 100).toFixed(2);
    const lines = items.map((i) => `${i.q} × ${i.id} (${i.s})`).join('\n');
    await mail(to, `Νέα παραγγελία (κάρτα, πληρώθηκε) — ${total}€`, `${lines}\n\nΣύνολο: ${total}€\n${m.customer || ''}\n${s.customer_details && s.customer_details.email || ''}${m.note ? '\nΣημείωση: ' + m.note : ''}`);
  }
  return new Response('ok');
};
