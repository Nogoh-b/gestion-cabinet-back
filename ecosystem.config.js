module.exports = {
  apps: [
    {
      name: 'gestion-cabinet-back',
      script: './dist/src/main.js',
      autorestart: true,
      exec_mode: 'fork',
      max_restarts: 10,
      min_uptime: '10s',
      watch: false,
      instances: 1,
      node_args: '--max-old-space-size=1024',
      max_memory_restart: '900M',
      combine_logs: true,
      error_file: '/www/wwwlogs/pm2/gestion-cabinet-back-error.log',
      out_file: '/www/wwwlogs/pm2/gestion-cabinet-back-out.log',
      time: true,
      env: {
        NODE_ENV: 'production',
        PORT: parseInt(process.env.PORT || '3005', 10),
      },
    },
  ],
}
