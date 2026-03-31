// Setup:
//   npm install
//   npx prisma db push
//   npx prisma db seed
//   cp .env.example .env  (then fill in GMAIL credentials)
//   npm run build
//
// Run with pm2:
//   pm2 start ecosystem.config.js
//   pm2 save
//   pm2 startup  (to persist across reboots)
//
// Or run directly:
//   npm start

module.exports = {
  apps: [{
    name: 'gowild-tracker',
    script: 'npm',
    args: 'start',
    cwd: __dirname,
    env: {
      NODE_ENV: 'production',
      TZ: 'America/Los_Angeles',
    },
    restart_delay: 5000,
    max_restarts: 10,
  }],
}
