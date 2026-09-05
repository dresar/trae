# 🚀 Panduan VPS untuk WhatsApp Bot

Panduan lengkap untuk menjalankan WhatsApp Bot di VPS dengan performa optimal.

## 📋 Persyaratan Minimum VPS

- **RAM**: 1GB (Recommended: 2GB)
- **Storage**: 10GB free space
- **OS**: Ubuntu 18.04+ / CentOS 7+ / Debian 9+
- **Node.js**: v16.0.0 atau lebih baru
- **NPM**: v7.0.0 atau lebih baru

## 🛠️ Instalasi Awal

### 1. Update Sistem
```bash
sudo apt update && sudo apt upgrade -y
```

### 2. Install Node.js
```bash
# Install Node.js 18 LTS
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# Verify installation
node --version
npm --version
```

### 3. Install PM2 Global
```bash
npm install -g pm2
```

### 4. Clone dan Setup Bot
```bash
# Clone repository atau upload files
cd /path/to/your/bot

# Install dependencies
npm install --production

# Copy environment file
cp .env.example .env
# Edit .env dengan konfigurasi yang sesuai
nano .env
```

## 🚀 Menjalankan Bot

### Metode 1: Script Otomatis (Recommended)
```bash
# Berikan permission execute
chmod +x start-vps.sh

# Jalankan script
./start-vps.sh
```

### Metode 2: Manual dengan PM2
```bash
# Start dengan PM2
pm2 start ecosystem.config.js

# Check status
pm2 status

# View logs
pm2 logs bot-kkn
```

## 🔧 Optimasi VPS

### 1. Memory Management
Bot sudah dikonfigurasi dengan optimasi memory:
- Max heap size: 512MB
- Garbage collection otomatis
- Memory monitoring
- Auto restart jika memory > 500MB

### 2. Cleanup Otomatis
```bash
# Jalankan cleanup manual
node cleanup.js

# Setup cron job untuk cleanup otomatis (opsional)
crontab -e
# Tambahkan baris berikut:
0 2 * * * cd /path/to/bot && node cleanup.js
```

### 3. Monitoring
```bash
# Monitor status bot
pm2 status

# Monitor logs real-time
pm2 logs bot-kkn --lines 50

# Monitor memory usage
pm2 monit
```

## 🛡️ Keamanan VPS

### 1. Firewall Setup
```bash
# Install UFW
sudo apt install ufw

# Allow SSH
sudo ufw allow ssh

# Allow HTTP/HTTPS (jika diperlukan)
sudo ufw allow 80
sudo ufw allow 443

# Enable firewall
sudo ufw enable
```

### 2. Secure SSH
```bash
# Edit SSH config
sudo nano /etc/ssh/sshd_config

# Ubah port default (opsional)
Port 2222

# Disable root login
PermitRootLogin no

# Restart SSH
sudo systemctl restart ssh
```

## 📊 Monitoring dan Maintenance

### Commands Berguna
```bash
# Status bot
pm2 status

# Restart bot
pm2 restart bot-kkn

# Stop bot
pm2 stop bot-kkn

# View logs
pm2 logs bot-kkn

# Clear logs
pm2 flush

# Cleanup files
node cleanup.js

# Check disk usage
df -h

# Check memory usage
free -h

# Check CPU usage
top
```

### Auto Startup
```bash
# Setup PM2 startup
pm2 startup
# Ikuti instruksi yang muncul

# Save current processes
pm2 save
```

## 🔧 Troubleshooting

### Bot Tidak Bisa Tagall
1. **Permission Issue**: Bot harus menjadi admin grup
2. **Metadata Access**: Pastikan bot memiliki akses membaca anggota grup
3. **Check logs**: `pm2 logs bot-kkn` untuk melihat error detail

### Memory Issues
1. **High Memory Usage**:
   ```bash
   # Check memory
   free -h
   
   # Restart bot
   pm2 restart bot-kkn
   
   # Run cleanup
   node cleanup.js
   ```

2. **Out of Memory**:
   - Bot akan auto-restart jika memory > 500MB
   - Periksa log: `pm2 logs bot-kkn`
   - Upgrade VPS jika perlu

### Connection Issues
1. **WhatsApp Connection Lost**:
   ```bash
   # Restart bot
   pm2 restart bot-kkn
   
   # Check logs
   pm2 logs bot-kkn --lines 100
   ```

2. **QR Code Issues**:
   - Stop bot: `pm2 stop bot-kkn`
   - Delete auth: `rm -rf auth_info_baileys`
   - Start bot: `pm2 start bot-kkn`
   - Scan QR code baru

### Performance Issues
1. **Slow Response**:
   - Check CPU: `top`
   - Check memory: `free -h`
   - Check disk: `df -h`
   - Run cleanup: `node cleanup.js`

2. **High CPU Usage**:
   ```bash
   # Check processes
   top
   
   # Restart bot
   pm2 restart bot-kkn
   ```

## 📈 Optimasi Lanjutan

### 1. Swap File (untuk VPS RAM kecil)
```bash
# Create 1GB swap
sudo fallocate -l 1G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile

# Make permanent
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
```

### 2. Nginx Reverse Proxy (opsional)
```bash
# Install Nginx
sudo apt install nginx

# Configure reverse proxy jika bot memiliki web interface
```

### 3. SSL Certificate (opsional)
```bash
# Install Certbot
sudo apt install certbot python3-certbot-nginx

# Get certificate
sudo certbot --nginx -d yourdomain.com
```

## 📞 Support

Jika mengalami masalah:
1. Check logs: `pm2 logs bot-kkn`
2. Run cleanup: `node cleanup.js`
3. Restart bot: `pm2 restart bot-kkn`
4. Check system resources: `free -h`, `df -h`, `top`

## 📝 Changelog

### v1.1.0
- ✅ Fixed tagall permission issues
- ✅ Enhanced memory management
- ✅ Added cleanup script
- ✅ Improved error handling
- ✅ VPS optimization

### v1.0.0
- 🚀 Initial VPS setup
- 📦 PM2 configuration
- 🔧 Basic optimization

---

**Catatan**: Pastikan selalu backup data penting sebelum melakukan update atau maintenance.