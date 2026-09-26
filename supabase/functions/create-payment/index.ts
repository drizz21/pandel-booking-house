// ============================================================
// Supabase Edge Function: create-payment
// Membuat transaksi Midtrans Snap dan mengembalikan snap_token
//
// Deploy: supabase functions deploy create-payment
// Secrets: supabase secrets set MIDTRANS_SERVER_KEY=SB-Mid-server-xxx
//
// Mode MOCK: set MOCK_PAYMENT=true untuk testing tanpa Midtrans
// ============================================================

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const MIDTRANS_SERVER_KEY = Deno.env.get('MIDTRANS_SERVER_KEY') ?? '';
const MIDTRANS_IS_PROD    = Deno.env.get('MIDTRANS_IS_PRODUCTION') === 'true';
const MOCK_PAYMENT        = Deno.env.get('MOCK_PAYMENT') === 'true';

const MIDTRANS_URL = MIDTRANS_IS_PROD
  ? 'https://app.midtrans.com/snap/v1/transactions'
  : 'https://app.sandbox.midtrans.com/snap/v1/transactions';

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

// ── Service key ─────────────────────────────────────────────
// Pakai SUPABASE_SECRET_KEYS (format baru, non-JWT) yang otomatis
// tersedia di setiap Edge Function. Fallback ke SUPABASE_SERVICE_ROLE_KEY
// (legacy JWT) hanya bila secret baru tidak ada.
function getServiceKey(): string {
  const raw = Deno.env.get('SUPABASE_SECRET_KEYS');
  if (raw) {
    try {
      const obj = JSON.parse(raw) as Record<string, string>;
      const v = obj?.default ?? Object.values(obj ?? {})[0];
      if (typeof v === 'string' && v) return v;
    } catch { /* lanjut ke fallback */ }
  }
  const single = Deno.env.get('SUPABASE_SECRET_KEY');
  if (single) return single;
  return Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  try {
    const { bookingId, paymentMethod } = await req.json();
    if (!bookingId) return json({ error: 'bookingId wajib diisi' }, 400);

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      getServiceKey(),
    );

    // ── Ambil data booking ──────────────────────────────────
    const { data: booking, error: bkErr } = await supabase
      .from('bookings')
      .select('*, courts(name, type), customers(name, phone, email)')
      .eq('id', bookingId)
      .single();

    if (bkErr || !booking) return json({ error: 'Booking tidak ditemukan' }, 404);
    if (!['held', 'pending'].includes(booking.status))
      return json({ error: `Booking berstatus "${booking.status}" tidak bisa dibayar` }, 409);

    const orderId = `PKJ-${booking.booking_code}-${Date.now()}`;

    // ── MODE MOCK (testing tanpa Midtrans) ──────────────────
    if (MOCK_PAYMENT) {
      await supabase.from('payments').insert({
        booking_id: bookingId,
        order_id:   orderId,
        gateway:    'mock',
        status:     'paid',
        amount:     booking.total_price,
        payment_type: paymentMethod ?? 'mock',
        paid_at:    new Date().toISOString(),
      });

      await supabase
        .from('bookings')
        .update({ status: 'paid' })
        .eq('id', bookingId);

      return json({
        mock: true,
        snap_token: null,
        order_id: orderId,
        message: 'MOCK_PAYMENT aktif — booking langsung ditandai paid',
      });
    }

    // ── Mode PRODUCTION / SANDBOX ───────────────────────────
    if (!MIDTRANS_SERVER_KEY) {
      return json({ error: 'MIDTRANS_SERVER_KEY belum diset di Supabase secrets' }, 500);
    }

    const enabledPayments =
      paymentMethod === 'qris'    ? ['qris', 'gopay'] :
      paymentMethod === 'va'      ? ['bca_va', 'bni_va', 'bri_va', 'mandiri_bill', 'permata_va'] :
      paymentMethod === 'ewallet' ? ['gopay', 'shopeepay', 'dana'] :
      paymentMethod === 'credit_card' ? ['credit_card'] :
      undefined;

    const payload: Record<string, unknown> = {
      transaction_details: {
        order_id:     orderId,
        gross_amount: booking.total_price,
      },
      customer_details: {
        first_name: booking.customers?.name ?? 'Customer',
        phone:      booking.customers?.phone ?? '',
        email:      booking.customers?.email ?? '',
      },
      item_details: [{
        id:       booking.court_id,
        price:    booking.total_price,
        quantity: 1,
        name:     `${booking.courts?.name ?? 'Court'} — ${booking.booking_date} ${String(booking.start_time).slice(0,5)}`,
      }],
      callbacks: {
        finish: `${Deno.env.get('APP_URL') ?? ''}/success.html?booking_id=${bookingId}`,
      },
    };
    if (enabledPayments) payload.enabled_payments = enabledPayments;

    const auth = btoa(`${MIDTRANS_SERVER_KEY}:`);
    const resp = await fetch(MIDTRANS_URL, {
      method:  'POST',
      headers: {
        'Content-Type':  'application/json',
        'Accept':        'application/json',
        'Authorization': `Basic ${auth}`,
      },
      body: JSON.stringify(payload),
    });

    const mtData = await resp.json();
    if (!resp.ok) {
      return json({ error: 'Midtrans error', detail: mtData }, 502);
    }

    // ── Simpan record payment ───────────────────────────────
    await supabase.from('payments').insert({
      booking_id:   bookingId,
      order_id:     orderId,
      gateway:      'midtrans',
      status:       'pending',
      amount:       booking.total_price,
      payment_type: paymentMethod ?? null,
      raw_response: mtData,
      expired_at:   new Date(Date.now() + 24 * 3600 * 1000).toISOString(),
    });

    return json({ snap_token: mtData.token, order_id: orderId, redirect_url: mtData.redirect_url });
  } catch (err) {
    return json({ error: String(err?.message ?? err) }, 500);
  }
});
