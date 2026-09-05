module.exports = {
  apps: [{
    name: 'bot-kkn',
    script: 'index.js',
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: '500M',
    env: {
      NODE_ENV: 'production',
      PORT: 3000,
      NODE_OPTIONS: '--max-old-space-size=512 --optimize-for-size --max-semi-space-size=64'
    },
    env_production: {
      NODE_ENV: 'production',
      PORT: 3000,
      NODE_OPTIONS: '--max-old-space-size=512 --optimize-for-size --max-semi-space-size=64'
    },
    error_file: './logs/pm2-error.log',
    out_file: './logs/pm2-out.log',
    log_file: './logs/pm2-combined.log',
    time: true,
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    merge_logs: true,
    max_restarts: 10,
    min_uptime: '10s',
    restart_delay: 4000,
    kill_timeout: 5000,
    listen_timeout: 8000,
    shutdown_with_message: true,
    wait_ready: true,
    // Memory optimization for VPS
    node_args: '--max-old-space-size=512 --optimize-for-size --max-semi-space-size=64 --expose-gc',
    exec_mode: 'fork',
    cron_restart: '0 4 * * *' // Restart daily at 4 AM to prevent memory leaks
  }]
};