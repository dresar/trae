# 🚀 VPS Deployment Guide - Bot KKN

## 📋 Persyaratan VPS
- **RAM**: Minimum 1GB (Recommended 2GB)
- **CPU**: 1 Core
- **Storage**: Minimum 10GB
- **OS**: Ubuntu 20.04+ / CentOS 7+ / Windows Server
- **Node.js**: Version 16+
- **PM2**: Process Manager

## 🛠️ Instalasi di VPS Linux

### 1. Update System
```bash
sudo apt update && sudo apt upgrade -y
```

### 2. Install Node.js
```bash
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs
```

### 3. Install PM2
```bash
npm install -g pm2
```

### 4. Upload Bot Files
```bash
# Upload semua file bot ke /home/bot-kkn/
scp -r ./bot-kkn/ user@your-vps-ip:/home/
```

### 5. Install Dependencies
```bash
cd /home/bot-kkn
npm install --production --no-optional
```

### 6. Set Permissions
```bash
chmod +x start-vps.sh
```

### 7. Start Bot
```bash
./start-vps.sh
```

## 🪟 Instalasi di VPS Windows

### 1. Install Node.js
- Download dari https://nodejs.org/
- Install versi LTS

### 2. Install PM2
```cmd
npm install -g pm2
npm install -g pm2-windows-service
pm2-service-install
```

### 3. Upload Bot Files
- Upload ke C:\bot-kkn\

### 4. Install Dependencies
```cmd
cd C:\bot-kkn
npm install --production --no-optional
```

### 5. Start Bot
```cmd
start-vps.bat
```

## ⚙️ Konfigurasi Environment

### File .env (WAJIB DIKONFIGURASI)
```env
# Bot Configuration
NODE_ENV=production
BOT_PREFIX=.

# API Keys (Isi semua yang diperlukan)
GEMINI_API_KEY_1=your_gemini_key_here
GROQ_API_KEY_1=your_groq_key_here
REMOVE_BG_API_KEY=your_removebg_key_here
# ... dan API keys lainnya
```

## 🔧 Optimasi VPS 1GB RAM

### 1. Memory Optimization
```bash
# Tambahkan swap file
sudo fallocate -l 1G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
```

### 2. System Limits
```bash
# Edit /etc/security/limits.conf
echo "* soft nofile 65536" | sudo tee -a /etc/security/limits.conf
echo "* hard nofile 65536" | sudo tee -a /etc/security/limits.conf
```

### 3. Node.js Optimization
```bash
export NODE_OPTIONS="--max-old-space-size=512 --optimize-for-size"
```

## 📊 Monitoring & Management

### PM2 Commands
```bash
# Status bot
pm2 status

# Lihat logs
pm2 logs bot-kkn

# Restart bot
pm2 restart bot-kkn

# Stop bot
pm2 stop bot-kkn

# Monitor real-time
pm2 monit

# Auto-start on boot
pm2 startup
pm2 save
```

### Memory Monitoring
```bash
# Check memory usage
free -h

# Check bot memory usage
pm2 show bot-kkn

# System resources
htop
```

## 🚨 Troubleshooting

### Bot Crash karena Memory
```bash
# Restart dengan memory limit
pm2 restart bot-kkn --max-memory-restart 800M
```

### Connection Issues
```bash
# Check network
ping google.com

# Check ports
netstat -tulpn | grep :3000
```

### Database Issues
```bash
# Backup database
cp -r database/ database_backup/

# Reset database (hati-hati!)
rm database/*.json
```

## 🔐 Security

### Firewall Setup
```bash
# Ubuntu/Debian
sudo ufw allow ssh
sudo ufw allow 3000
sudo ufw enable

# CentOS/RHEL
sudo firewall-cmd --permanent --add-port=3000/tcp
sudo firewall-cmd --reload
```

### Auto-Update
```bash
# Crontab untuk auto-restart harian
crontab -e
# Tambahkan: 0 4 * * * pm2 restart bot-kkn
```

## 📈 Performance Tips

1. **Gunakan SSD** untuk storage yang lebih cepat
2. **Monitor memory usage** secara berkala
3. **Cleanup logs** secara rutin
4. **Update dependencies** secara berkala
5. **Backup database** secara otomatis

## 🆘 Support

Jika mengalami masalah:
1. Check logs: `pm2 logs bot-kkn`
2. Check memory: `free -h`
3. Restart bot: `pm2 restart bot-kkn`
4. Contact admin jika masalah persisten

---

✅ **Bot siap berjalan 24/7 di VPS!**