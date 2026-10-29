# FinSaku Web — Paket Lengkap

Web app pencatatan keuangan pribadi berbahasa Indonesia dengan frontend responsif, Google Sheets sebagai database, dan Google Apps Script sebagai API.

## Isi paket
- `index.html` — struktur aplikasi
- `styles.css` — desain responsif
- `app.js` — navigasi, dashboard, filter transaksi, input manual, foto struk, dan catatan suara
- `config.js` — URL GAS dan token API
- `backend/backend.gs` — backend Google Apps Script
- `README.md` — panduan setup

## 1. Siapkan database
1. Buat Google Sheets baru dengan nama **FinSaku Database**.
2. Pilih **Ekstensi → Apps Script**.
3. Buka file `backend/backend.gs` dari paket ZIP, salin seluruh isinya ke editor Apps Script (file `Code.gs`), lalu simpan.
4. Pilih fungsi `setupFinSaku` lalu klik **Jalankan**. Setujui izin akses yang diminta.
5. Buka **Execution log / Log eksekusi**, salin nilai `API TOKEN`. Fungsi ini membuat sheet `Transaksi` dan header secara otomatis.

## 2. Aktifkan fitur AI (opsional)
Fitur transaksi manual tidak memerlukan Gemini. Untuk analisis foto struk dan pemrosesan catatan suara:
1. Buat API key di https://aistudio.google.com/apikey.
2. Di Apps Script buka **Project Settings → Script Properties**.
3. Tambahkan `GEMINI_API_KEY` dengan nilai API key. Jangan menaruh key Gemini di frontend.

Browser melakukan speech-to-text untuk catatan suara. Teksnya kemudian dikirim ke GAS untuk ditafsirkan oleh Gemini.

## 3. Deploy backend
1. Klik **Deploy → New deployment**.
2. Pilih **Web app**.
3. **Execute as:** Me.
4. Pilih siapa yang boleh mengakses sesuai kebutuhan dan kebijakan akun. Deployment publik berisiko disalahgunakan; token API diperlukan tetapi jangan bagikan token.
5. Klik **Deploy**, berikan otorisasi jika diminta, dan salin URL yang berakhir `/exec`.

Uji URL dengan membuka:
`URL_WEB_APP/exec?action=health`
Respons seharusnya memuat `{"success":true,"message":"FinSaku API aktif."}`.

## 4. Hubungkan frontend
1. Buka `config.js` di folder FinSaku-Web.
2. Isi `GAS_URL` dengan URL `/exec` yang didapat dari deployment.
3. Isi `API_TOKEN` dengan token dari execution log.
4. Simpan file. Host seluruh folder sebagai situs statis (misalnya hosting web statis) atau jalankan lewat server lokal. Buka `index.html` secara langsung dapat mengalami pembatasan browser; hosting melalui HTTP/HTTPS lebih disarankan.
5. Buka situs dan klik **Muat ulang** pada halaman Transaksi. Dashboard akan mengambil transaksi lama dari Google Sheets.

Contoh `config.js`:
```js
window.FINSAKU_CONFIG = {
  GAS_URL: "https://script.google.com/macros/s/ID_DEPLOYMENT/exec",
  API_TOKEN: "TOKEN_DARI_EXECUTION_LOG"
};
```

## Fitur
- Dashboard total saldo, pemasukan, pengeluaran, grafik 6 bulan, dan transaksi terbaru
- Input manual untuk pemasukan/pengeluaran
- Riwayat transaksi dari Google Sheets, pencarian dan filter
- Upload foto struk (JPG/PNG/WebP, maksimal 3 MB) dan analisis Gemini
- Pengenalan suara browser (jika didukung) dan analisis Gemini
- Validasi token API di backend

## Catatan penting keamanan dan operasional
- API token frontend dapat dilihat siapa pun yang bisa mengakses situs; token membantu validasi dasar tetapi bukan autentikasi kuat. Untuk penggunaan pribadi, batasi akses situs dan jangan gunakan data yang sangat sensitif.
- URL Web App harus benar-benar berasal dari deployment Apps Script Anda.
- Setelah mengubah kode backend, buat versi deployment baru melalui **Deploy → Manage deployments → Edit → New version → Deploy**.
- Periksa transaksi hasil AI sebelum mengandalkannya sebagai pembukuan final.
- Jika terjadi error jaringan/CORS, pastikan web di-host melalui HTTP/HTTPS dan deployment GAS dapat diakses dari browser; jangan gunakan mode `no-cors`.
- Paket ini tidak berisi URL GAS, API token, atau Gemini API key milik Anda; semua itu harus Anda masukkan sendiri.
