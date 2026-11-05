/**
 * PM2 process definition, used by deploy/remote-deploy.sh.
 *
 * `cwd` is the `current` symlink, not a release folder, so every (re)start runs whatever
 * release `current` points at. `.env.production` in each release links to the shared env file,
 * the same way `npm start` loads it.
 */
const path = require('node:path');

// This file lives in <APP_DIR>/releases/<release>/deploy/.
const appDir = process.env.APP_DIR || path.resolve(__dirname, '..', '..', '..');

module.exports = {
  apps: [
    {
      name: process.env.PM2_APP_NAME || 'gamereels-api',
      cwd: path.join(appDir, 'current'),
      script: 'dist/main.js',
      node_args: '--env-file=.env.production',
      exec_mode: 'fork',
      instances: 1,
      autorestart: true,
      max_memory_restart: '512M',
      kill_timeout: 10000,
      time: true,
      env: { NODE_ENV: 'production' },
    },
  ],
};
