// PM2 process definition for the native Next.js production server.
//
//   pm2 start ecosystem.config.cjs
//   pm2 reload ecosystem.config.cjs --update-env   # after a rebuild
//   pm2 save && pm2 startup                         # survive reboots
//
// Runtime env (DATABASE_URL, AUTH_SECRET, AUTH_TRUST_HOST, RESEND_*, ...) is
// loaded by Next.js itself from `.env.production` in this directory — no need to
// duplicate it here. NEXT_PUBLIC_* values are already inlined at build time.
module.exports = {
  apps: [
    {
      name: 'bidit',
      cwd: __dirname,
      // Run the Next CLI entry directly so PM2 supervises the real server
      // process (not a pnpm/npm wrapper that would orphan it).
      script: './node_modules/next/dist/bin/next',
      args: 'start -p 3000',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      max_restarts: 10,
      // OCI Ampere A1 has plenty of RAM; restart if a single instance leaks
      // past 1GB. Bump on the x86 micro fallback only if you also added swap.
      max_memory_restart: '1G',
      env: {
        NODE_ENV: 'production',
        PORT: '3000',
      },
    },
  ],
};
