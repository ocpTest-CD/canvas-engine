import { spawnSync } from 'node:child_process';
const result = spawnSync(process.execPath, ['node_modules/@playwright/test/cli.js', 'test', ...process.argv.slice(2)], {
  env: {...process.env, CANVAS_ALL_BROWSERS: '1'}, stdio: 'inherit'
});
process.exit(result.status ?? 1);
