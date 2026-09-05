#!/bin/bash

# WhatsApp Bot VPS Startup Script
# Optimized for low-spec VPS environments

echo "🚀 Starting WhatsApp Bot for VPS..."
echo "======================================"

# Set environment variables for production
export NODE_ENV=production
export NODE_OPTIONS="--max-old-space-size=512 --optimize-for-size --max-semi-space-size=64"

# Check Node.js version
NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt "16" ]; then
    echo "⚠️ Warning: Node.js version $NODE_VERSION detected. Recommended: Node.js 16+"
fi

# Check if PM2 is installed
if ! command -v pm2 &> /dev/null; then
    echo "📦 Installing PM2..."
    npm install -g pm2
fi

# Create necessary directories
mkdir -p logs
mkdir -p backups

# Run cleanup script
echo "🧹 Running cleanup script..."
node cleanup.js 2>/dev/null || echo "⚠️ Cleanup script not found, skipping..."

# Install dependencies if needed
if [ ! -d "node_modules" ]; then
    echo "📦 Installing production dependencies..."
    npm install --production --no-optional
fi

# Stop existing processes
echo "🛑 Stopping existing processes..."
pm2 stop bot-kkn 2>/dev/null || true
pm2 delete bot-kkn 2>/dev/null || true

# Clean up system memory (if possible)
echo "🧹 Cleaning up system memory..."
sync && echo 3 > /proc/sys/vm/drop_caches 2>/dev/null || true

# Start the bot with PM2
echo "▶️ Starting bot with PM2..."
pm2 start ecosystem.config.js

# Show status and logs
echo "📊 PM2 Status:"
pm2 status

echo "📋 Recent logs:"
pm2 logs bot-kkn --lines 10

echo "   node cleanup.js     - Run cleanup"

echo "======================================"
echo "✅ Bot started successfully!"
echo "📋 Useful commands:"
echo "   pm2 status          - Check bot status"
echo "   pm2 logs bot-kkn    - View logs"
echo "   pm2 restart bot-kkn - Restart bot"
echo "   pm2 stop bot-kkn    - Stop bot"
echo "   node cleanup.js     - Run cleanup"