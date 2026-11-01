// PM2 processes for auth.tretu.de (contract §0). Start/reload: pm2 reload ecosystem.config.cjs --update-env
module.exports = {
  apps: [
    {
      name: "tretu-auth",
      cwd: __dirname,
      script: "node_modules/next/dist/bin/next",
      args: "start -p 3021 -H 127.0.0.1",
      env: { NODE_ENV: "production", PORT: "3021" },
      max_memory_restart: "768M",
      time: true,
    },
    {
      // Delivers user events from the outbox to the platform (no-op until TRETU_PLATFORM_URL + TRETU_APP_SECRET are set).
      name: "tretu-auth-events",
      cwd: __dirname,
      script: "node_modules/tsx/dist/cli.mjs",
      args: "--env-file-if-exists=.env scripts/worker-events.ts",
      env: { NODE_ENV: "production" },
      max_memory_restart: "256M",
      time: true,
    },
  ],
}
