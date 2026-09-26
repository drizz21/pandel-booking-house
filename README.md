# Padel Kita Jogja — Booking System

Sistem booking lapangan padel berbasis HTML + Vanilla JS + Supabase + Midtrans.

---

## Stack

| Layer | Teknologi |
|---|---|
| Frontend | HTML5 + CSS3 (custom) |
| Logic | Vanilla JavaScript (ES Modules) |
| Database | Supabase PostgreSQL |
| Realtime | Supabase Realtime |
| Auth (admin) | Supabase Auth |
| Payment | Midtrans Snap |
| Email (opsional) | Resend |
| WA (opsional) | Fonnte / Wablas |

---

## Struktur Folder

```
padel-booking/
│
├── index.html          ← Landing page + booking calendar
├── checkout.html       ← Halaman checkout (nama, WA, email, payment)
├── success.html        ← Konfirmasi booking sukses
├── 404.html            ← Halaman error 404 (WAJIB ada utk Cloudflare Pages)
│
├── assets/             ← favicon, icon, logo, og-image, webmanifest
│   ├── favicon.ico / favicon.svg
│   ├── favicon-16x16.png ... favicon-96x96.png
│   ├── apple-touch-icon.png
│   ├── android-chrome-192x192.png / -512x512.png
│   ├── logo-black-gold.svg
│   ├── og-image.png
│   └── site.webmanifest
│
├── admin/
│   ├── login.html      ← Login admin
│   ├── index.html      ← Dashboard admin
│   ├── bookings.html   ← Semua booking
│   ├── calendar.html   ← Kalender admin + block slot
│   └── courts.html     ← Manajemen lapangan
│
├── css/
│   └── admin.css
│
├── images/             ← Gambar web (sudah teroptimasi)
│
├── js/
│   ├── config.js       ← Konfigurasi (Supabase URL, Midtrans key)
│   ├── supabase.js     ← Supabase client singleton
│   ├── booking/
│   │   ├── availability.js  ← Cek ketersediaan slot + realtime
│   │   ├── booking.js       ← Hold, update, get booking
│   │   └── calendar.js      ← Widget kalender booking
│   ├── checkout/
│   │   ├── checkout.js      ← Controller checkout page
│   │   ├── validation.js    ← Validasi form
│   │   └── payment.js       ← Integrasi Midtrans Snap
│   ├── admin/
│   │   └── dashboard.js     ← Admin controller
│   └── utils/
│       ├── date.js          ← Helper tanggal/slot
│       └── currency.js      ← Format Rupiah + admin fee
│
├── supabase/
│   └── functions/      ← Edge Functions (create-payment, payment-webhook)
│
├── _headers            ← Security & cache headers (Cloudflare Pages)
├── _redirects          ← Pretty URL redirects (Cloudflare Pages)
├── _build-dist.py      ← Build whitelist → _dist/ (JANGAN deploy --dir=.)
├── wrangler.toml       ← Konfigurasi Cloudflare Pages
├── supabase-schema.sql ← Schema database lengkap
└── README.md
```

---

## Deploy (Cloudflare Pages)

```bash
python _build-dist.py     # build ke _dist/ (whitelist — cegah file sensitif ikut)
npx wrangler pages deploy _dist --project-name=padel-kita-jogja --branch=main --commit-dirty=true
```

> **JANGAN** pakai `wrangler pages deploy .` — file internal seperti `.env.local`,
> `README.md`, dan `supabase-schema.sql` akan ikut ter-upload ke publik.

> **WAJIB** ada `404.html` di root. Tanpa itu Cloudflare Pages menganggap situs ini
> SPA dan semua path tak dikenal akan membalas `index.html` dengan status 200.


---

## Setup Awal

### 1. Supabase

1. Buat project baru di [supabase.com](https://supabase.com)
2. Buka **SQL Editor** → paste seluruh isi `supabase-schema.sql` → Run
3. Buka **Settings → API** → copy `URL` dan `anon key`
4. Isi ke `js/config.js`:

```js
SUPABASE_URL:      'https://xxxx.supabase.co',
SUPABASE_ANON_KEY: 'eyJxxxx...',
```

5. Di Supabase **Database → Replication** → aktifkan `bookings` dan `blocked_slots`

### 2. Midtrans

1. Daftar di [sandbox.midtrans.com](https://sandbox.midtrans.com)
2. Ambil **Snap Client Key** → isi `MIDTRANS_CLIENT_KEY` di `config.js`
3. Buat **Edge Function** di Supabase untuk generate Snap token (lihat bagian Edge Function di bawah)

### 3. Admin

1. Di Supabase **Authentication → Users** → buat user admin baru
2. Di **SQL Editor** jalankan:

```sql
INSERT INTO admins (id, name, role)
VALUES ('<user-id-dari-auth>', 'Nama Admin', 'superadmin');
```

3. Login di `/admin/login.html`

---

## Edge Function: create-payment

Buat file `supabase/functions/create-payment/index.ts`:

```typescript
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const MIDTRANS_SERVER_KEY = Deno.env.get('MIDTRANS_SERVER_KEY')!
const MIDTRANS_URL = 'https://app.sandbox.midtrans.com/snap/v1/transactions'

serve(async (req) => {
  const { bookingId, paymentMethod } = await req.json()

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )

  // Ambil data booking
  const { data: booking } = await supabase
    .from('bookings')
    .select('*, courts(*), customers(*)')
    .eq('id', bookingId)
    .single()

  if (!booking) return new Response(JSON.stringify({ error: 'Booking not found' }), { status: 404 })

  const orderId = `PKJ-${booking.booking_code}-${Date.now()}`

  // Buat transaksi Midtrans
  const payload = {
    transaction_details: { order_id: orderId, gross_amount: booking.total_price },
    customer_details: {
      first_name: booking.customers?.name,
      phone:      booking.customers?.phone,
      email:      booking.customers?.email,
    },
    item_details: [{
      id:       booking.court_id,
      price:    booking.total_price,
      quantity: 1,
      name:     `${booking.courts?.name} — ${booking.booking_date} ${booking.start_time?.slice(0,5)}`,
    }],
    enabled_payments: paymentMethod === 'qris'    ? ['qris'] :
                      paymentMethod === 'va'      ? ['bca_va','bni_va','mandiri_bill'] :
                      paymentMethod === 'ewallet' ? ['gopay','shopeepay','dana'] :
                      undefined,
  }

  const response = await fetch(MIDTRANS_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Basic ${btoa(MIDTRANS_SERVER_KEY + ':')}`,
    },
    body: JSON.stringify(payload),
  })

  const midtransData = await response.json()

  // Simpan order_id ke payments table
  await supabase.from('payments').insert({
    booking_id: bookingId,
    order_id:   orderId,
    gateway:    'midtrans',
    amount:     booking.total_price,
    status:     'pending',
  })

  return new Response(JSON.stringify({ snap_token: midtransData.token }), {
    headers: { 'Content-Type': 'application/json' },
  })
})
```

Deploy:
```bash
supabase functions deploy create-payment
supabase secrets set MIDTRANS_SERVER_KEY=SB-Mid-server-XXXX
```

---

## Webhook Midtrans

Buat Edge Function `supabase/functions/payment-webhook/index.ts` untuk menerima notifikasi dari Midtrans:

```typescript
serve(async (req) => {
  const body = await req.json()
  const { order_id, transaction_status, fraud_status } = body

  // Update payment & booking status berdasarkan status Midtrans
  const isSuccess = transaction_status === 'capture' && fraud_status === 'accept'
                 || transaction_status === 'settlement'

  if (isSuccess) {
    // Update payment → paid
    await supabase.from('payments').update({ status: 'paid', paid_at: new Date() }).eq('order_id', order_id)
    // Update booking → paid
    const { data: payment } = await supabase.from('payments').select('booking_id').eq('order_id', order_id).single()
    await supabase.from('bookings').update({ status: 'paid' }).eq('id', payment.booking_id)
  }

  return new Response('OK')
})
```

Di Midtrans Dashboard → Configuration → Payment Notification URL:
```
https://YOUR_PROJECT.supabase.co/functions/v1/payment-webhook
```

---

## Alur Booking

```
Customer buka index.html
    ↓
Pilih lapangan di court selector
    ↓
Pilih tanggal di kalender (realtime dari Supabase)
    ↓
Pilih slot waktu (🟢 tersedia / 🔴 booked / ⬛ past)
    ↓
Klik "Lanjut ke Checkout"
    ↓ holdSlot() → status: 'held', hold 15 menit
checkout.html?booking_id=xxx
    ↓
Isi nama, WA, email
Pilih metode bayar
    ↓ attachCustomerToBooking()
Klik "Bayar"
    ↓ create-payment Edge Function → Midtrans Snap Token
Midtrans Snap popup
    ↓ onSuccess / onPending
success.html?booking_id=xxx
    ↓
Webhook Midtrans → update status → 'paid'
    ↓
Admin konfirmasi → 'confirmed'
```

---

## Status Booking

| Status | Deskripsi |
|---|---|
| `pending` | Baru dibuat |
| `held` | Di-hold saat checkout (15 menit) |
| `paid` | Pembayaran sukses |
| `confirmed` | Admin konfirmasi |
| `cancelled` | Dibatalkan |
| `expired` | Hold expired tanpa bayar |

---

## Pengembangan Berikutnya

- [ ] WhatsApp notifikasi via Fonnte (setelah booking confirmed)
- [ ] Email konfirmasi via Resend
- [ ] Admin calendar.html — view & block slot
- [ ] Admin courts.html — CRUD lapangan
- [ ] Halaman cek status booking (`/status.html?code=PKJ-xxx`)
- [ ] Deploy ke Netlify / Vercel (static) + Supabase Edge Functions

---

## Menjalankan Lokal

Karena menggunakan ES Modules, perlu local server (bukan `file://`):

```bash
# Option 1: VS Code Live Server extension
# Option 2: Python
python -m http.server 5500
# Option 3: npx
npx serve .
```

Buka: `http://localhost:5500`
