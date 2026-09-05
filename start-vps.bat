@echo off
echo 🚀 Starting Bot KKN for Windows VPS...

REM Set environment variables for production
set NODE_ENV=production
set NODE_OPTIONS=--max-old-space-size=512 --optimize-for-size

REM Check if PM2 is installed
pm2 --version >nul 2>&1
if errorlevel 1 (
    echo 📦 Installing PM2...
    npm install -g pm2
)

REM Stop existing processes
echo 🛑 Stopping existing processes...
pm2 stop bot-kkn 2>nul
pm2 delete bot-kkn 2>nul

REM Start the bot with PM2
echo ▶️ Starting bot with PM2...
pm2 start ecosystem.config.js

REM Show status
pm2 status
pm2 logs bot-kkn --lines 20

echo ✅ Bot KKN started successfully!
echo 📊 Use 'pm2 status' to check status
echo 📝 Use 'pm2 logs bot-kkn' to view logs
echo 🔄 Use 'pm2 restart bot-kkn' to restart
echo 🛑 Use 'pm2 stop bot-kkn' to stop
pause