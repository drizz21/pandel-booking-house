// ============================================================
// Supabase Edge Function: payment-webhook
// Menerima notifikasi pembayaran dari Midtrans
//
// Deploy: supabase functions deploy payment-webhook --no-verify-jwt
// Set di Midtrans Dashboard → Settings → Configuration:
//   Payment Notification URL:
//   https://<project-ref>.supabase.co/functions/v1/payment-webhook
// ============================================================

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const MIDTRANS_SERVER_KEY = Deno.env.get('MIDTRANS_SERVER_KEY') ?? '';

serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  try {
    const body = await req.json();
    const {
      order_id,
      transaction_id,
      transaction_status,
      fraud_status,
      payment_type,
      va_numbers,
      permata_va_number,
      store,
      gross_amount,
    } = body;

    if (!order_id) return new Response('order_id missing', { status: 400 });

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // ── Verifikasi signature (opsional tapi disarankan) ─────
    // signature_key = sha512(order_id + status_code + gross_amount + server_key)
    // Bisa diaktifkan setelah server key tersedia.

    // ── Tentukan status ─────────────────────────────────────
    const isPaid =
      (transaction_status === 'capture'    && fraud_status === 'accept') ||
       transaction_status === 'settlement';

    const isPending   = transaction_status === 'pending';
    const isFailed    = ['deny', 'cancel', 'failure'].includes(transaction_status);
    const isExpired   = transaction_status === 'expire';
    const isRefunded  = ['refund', 'partial_refund'].includes(transaction_status);

    let paymentStatus = 'pending';
    if (isPaid)     paymentStatus = 'paid';
    if (isFailed)   paymentStatus = 'failed';
    if (isExpired)  paymentStatus = 'expired';
    if (isRefunded) paymentStatus = 'refunded';

    // ── Update payments ─────────────────────────────────────
    const vaNumber = va_numbers?.[0]?.va_number ?? permata_va_number ?? null;

    const { data: payment } = await supabase
      .from('payments')
      .update({
        status:       paymentStatus,
        gateway_tx_id: transaction_id,
        payment_type: payment_type ?? null,
        va_number:    vaNumber,
        qr_code_url:  store ? JSON.stringify(store) : null,
        raw_response: body,
        paid_at:      isPaid ? new Date().toISOString() : null,
      })
      .eq('order_id', order_id)
      .select('booking_id')
      .single();

    if (!payment?.booking_id) {
      return new Response('Payment record not found', { status: 404 });
    }

    // ── Update bookings ─────────────────────────────────────
    let bookingStatus: string | null = null;
    if (isPaid)    bookingStatus = 'paid';
    if (isFailed)  bookingStatus = 'cancelled';
    if (isExpired) bookingStatus = 'expired';

    if (bookingStatus) {
      await supabase
        .from('bookings')
        .update({ status: bookingStatus })
        .eq('id', payment.booking_id);
    }

    // ── Notifikasi WhatsApp (opsional, jika token diset) ────
    const WA_TOKEN = Deno.env.get('WA_API_TOKEN');
    if (isPaid && WA_TOKEN) {
      const { data: bk } = await supabase
        .from('bookings')
        .select('booking_code, booking_date, start_time, end_time, total_price, courts(name), customers(name, phone)')
        .eq('id', payment.booking_id)
        .single();

      if (bk?.customers?.phone) {
        const msg = `✅ Booking dikonfirmasi!\n\n` +
          `Kode: ${bk.booking_code}\n` +
          `Lapangan: ${bk.courts?.name}\n` +
          `Tanggal: ${bk.booking_date}\n` +
          `Waktu: ${String(bk.start_time).slice(0,5)} - ${String(bk.end_time).slice(0,5)}\n` +
          `Total: Rp ${Number(bk.total_price).toLocaleString('id-ID')}\n\n` +
          `Terima kasih! — Padel Kita Jogja`;

        await fetch(Deno.env.get('WA_API_URL') ?? 'https://api.fonnte.com/send', {
          method: 'POST',
          headers: { 'Authorization': WA_TOKEN, 'Content-Type': 'application/json' },
          body: JSON.stringify({ target: bk.customers.phone, message: msg }),
        }).catch(() => {});
      }
    }

    return new Response(JSON.stringify({ ok: true, paymentStatus, bookingStatus }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err?.message ?? err) }), { status: 500 });
  }
});
