// アプリを開かず、隔離した保存領域で自動確認する。
const { spawnSync } = require('node:child_process');
const path = require('node:path');
const root = path.join(__dirname, '..');
for (const args of [
  ['--check', 'script.js'],
  ['--check', 'test-data.js'],
  ['--check', 'data-io.js'],
  ['--test', 'tests/test-data.test.cjs', 'tests/audit-samples.test.cjs', 'tests/data-io.test.cjs']
]) {
  const result = spawnSync(process.execPath, args, { cwd: root, stdio: 'inherit' });
  if (result.error) { console.error(result.error.message); process.exit(1); }
  if (result.status !== 0) process.exit(result.status || 1);
}
