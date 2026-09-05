# Bot KKN WhatsApp

Bot WhatsApp multifungsi untuk keperluan KKN dengan berbagai fitur canggih.

## 🚀 Fitur Utama

- **AI Chat**: Integrasi dengan Gemini dan Groq AI
- **Manajemen File**: Upload, download, dan manajemen file
- **Keuangan**: Tracking pemasukan dan pengeluaran
- **Media**: Download YouTube, Instagram, TikTok
- **Utilitas**: Cuaca, berita, translate, OCR
- **Grup Management**: Admin tools, moderasi, analytics
- **Schedule**: Pengingat dan jadwal otomatis

## 📋 Persyaratan

- Node.js v16 atau lebih tinggi
- NPM atau Yarn
- WhatsApp account untuk bot

## 🛠️ Instalasi

1. **Clone repository**
   ```bash
   git clone <repository-url>
   cd bot-grup
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Setup Environment Variables**
   ```bash
   cp .env.example .env
   ```
   
   Edit file `.env` dan isi dengan API keys Anda:
   - `GOOGLE_API_KEY`: Google API key
   - `WEATHER_API_KEY`: OpenWeatherMap API key
   - `NEWS_API_KEY`: NewsAPI key
   - `GEMINI_API_KEY_1-5`: Google Gemini API keys
   - `GROQ_API_KEY_1-5`: Groq API keys
   - Dan API keys lainnya sesuai kebutuhan

4. **Jalankan Bot**
   ```bash
   npm start
   # atau
   node index.js
   ```

5. **Scan QR Code**
   - Buka WhatsApp di ponsel
   - Pilih "Linked Devices"
   - Scan QR code yang muncul di terminal

## 🔧 Konfigurasi

### Environment Variables

File `.env.example` berisi template untuk semua environment variables yang diperlukan. Salin ke `.env` dan isi dengan nilai yang sesuai.

### Admin Settings

Edit `database/admin_settings.json` untuk mengatur admin bot:
```json
{
  "admins": [
    "6281234567890@s.whatsapp.net"
  ]
}
```

## 🚀 Deployment VPS

Untuk deployment di VPS, gunakan script yang disediakan:

### Linux/Ubuntu
```bash
chmod +x start-vps.sh
./start-vps.sh
```

### Windows VPS
```cmd
start-vps.bat
```

Lihat `VPS-DEPLOYMENT.md` untuk panduan lengkap deployment.

## 📝 Commands

### AI Commands
- `.ai <pertanyaan>` - Chat dengan AI
- `.gemini <pertanyaan>` - Chat dengan Gemini
- `.groq <pertanyaan>` - Chat dengan Groq

### Media Commands
- `.yt <url>` - Download YouTube video
- `.ig <url>` - Download Instagram media
- `.tiktok <url>` - Download TikTok video

### Utility Commands
- `.cuaca <kota>` - Cek cuaca
- `.berita` - Berita terkini
- `.translate <text>` - Translate text
- `.ocr` - Extract text from image

### Finance Commands (Admin only)
- `.masuk <jumlah> <kategori> <keterangan>` - Catat pemasukan
- `.keluar <jumlah> <kategori> <keterangan>` - Catat pengeluaran
- `.saldo` - Cek saldo
- `.laporan` - Laporan keuangan

### Group Commands
- `.kick @user` - Kick member (admin only)
- `.promote @user` - Promote to admin
- `.demote @user` - Demote from admin
- `.mute @user` - Mute member
- `.stats` - Group statistics

## 🔒 Keamanan

- File `.env` sudah ditambahkan ke `.gitignore` untuk keamanan
- Gunakan `.env.example` sebagai template
- Jangan commit API keys ke repository
- Gunakan environment variables untuk production

## 🐛 Troubleshooting

### Bot tidak merespon
1. Pastikan bot sudah terhubung (cek terminal)
2. Pastikan nomor sudah terdaftar sebagai admin
3. Cek prefix command (default: `.`)

### Error saat startup
1. Pastikan semua dependencies terinstall
2. Cek file `.env` sudah dikonfigurasi
3. Pastikan Node.js versi 16+

### Memory issues di VPS
1. Gunakan script `start-vps.sh` atau `start-vps.bat`
2. Monitor dengan `pm2 monit`
3. Restart jika diperlukan: `pm2 restart bot-kkn`

## 📄 License

MIT License - Lihat file LICENSE untuk detail.

## 🤝 Contributing

1. Fork repository
2. Buat branch feature (`git checkout -b feature/AmazingFeature`)
3. Commit changes (`git commit -m 'Add some AmazingFeature'`)
4. Push ke branch (`git push origin feature/AmazingFeature`)
5. Buat Pull Request

## 📞 Support

Jika ada pertanyaan atau masalah, silakan buat issue di repository ini.