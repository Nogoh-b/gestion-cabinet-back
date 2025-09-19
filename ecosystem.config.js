module.exports = {
  apps: [
    {
      name: 'core-server-dev', // Nom du service Gateway
      script: './dist/src/main.js',
      autorestart: true,
      exec_mode: 'cluster',
      max_restarts: 10,
      min_uptime: '10s',
      watch: false,
      instances: 3,
      env: {
        NODE_ENV:'development',
        PORT: 3004,
      },
    },
  ],
}
