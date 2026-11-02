// PM2 processes for tretu.de (behind nginx, see deploy/nginx/tretu.de.conf and DEPLOY.md).
// Settings and secrets come from .env.local next to this file (Next.js and the workers load it on start).
//   pm2 start ecosystem.config.cjs        # first time
//   pm2 reload ecosystem.config.cjs --update-env
module.exports = {
  apps: [
    {
      name: "tretu-web",
      cwd: __dirname,
      script: "node_modules/next/dist/bin/next",
      // Bind to localhost only: nginx is the only way in. (next start ignores HOSTNAME, so pass -H.)
      args: "start -H 127.0.0.1 -p 3020",
      instances: 1,
      exec_mode: "fork",
      env: {
        NODE_ENV: "production",
        PORT: 3020,
        HOSTNAME: "127.0.0.1",
        // The orchestrator runs as its own process below; never twice.
        ORCHESTRATOR_EMBEDDED: "false",
      },
      kill_timeout: 10_000,
      max_memory_restart: "1500M",
      time: true,
    },
    {
      // Game-server jobs and monitoring (Hetzner, SSH, Cloudflare). A database lease guarantees one active worker.
      name: "tretu-orchestrator",
      cwd: __dirname,
      script: "scripts/orchestrator.ts",
      interpreter: "node",
      node_args: "--import tsx --import ./src/lib/env/load-local-env.ts",
      instances: 1,
      exec_mode: "fork",
      env: { NODE_ENV: "production" },
      // Jobs are failed on restart; give running SSH steps time to finish their current command.
      kill_timeout: 30_000,
      max_memory_restart: "600M",
      time: true,
    },
    {
      // TeamSpeak ranking (ServerQuery). Exits with 78 when TS_QUERY_* is not configured; PM2 then leaves it stopped.
      name: "tretu-ts-rank",
      cwd: __dirname,
      script: "scripts/ts-rank-worker.ts",
      interpreter: "node",
      node_args: "--import tsx --import ./src/lib/env/load-local-env.ts",
      instances: 1,
      exec_mode: "fork",
      env: { NODE_ENV: "production" },
      stop_exit_codes: [78],
      exp_backoff_restart_delay: 5_000,
      max_memory_restart: "400M",
      time: true,
    },
    {
      // Tretu platform: webhook delivery, jobs (push, badge sync), presence expiry, housekeeping.
      // Idles harmlessly while TRETU_APPS_JSON is not configured.
      name: "tretu-platform-worker",
      cwd: __dirname,
      script: "scripts/platform-worker.ts",
      interpreter: "node",
      node_args: "--import tsx --import ./src/lib/env/load-local-env.ts",
      instances: 1,
      exec_mode: "fork",
      env: { NODE_ENV: "production" },
      // SIGTERM finishes the current job and hands the rest back (scripts/platform-worker.ts); 78 = no DATABASE_URL.
      kill_timeout: 15_000,
      stop_exit_codes: [78],
      exp_backoff_restart_delay: 5_000,
      max_memory_restart: "400M",
      time: true,
    },
  ],
};
