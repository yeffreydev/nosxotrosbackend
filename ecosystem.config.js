// PM2 — producción en el VPS (api.pais.pe).
//   pm2 start ecosystem.config.js && pm2 save
module.exports = {
  apps: [
    {
      name: 'nosxotros-api',
      script: 'dist/main.js',
      cwd: __dirname,
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      max_memory_restart: '600M',
      env: { NODE_ENV: 'production' },
      time: true,
    },
  ],
};
