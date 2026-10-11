const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const output = path.join(root, 'dist');
let bytes = 0, checked = 0;
for (const dir of ['api', 'server', 'js', 'scripts', 'tests']) {
  for (const file of fs.readdirSync(path.join(root, dir))) {
    if (!/\.(js|cjs)$/.test(file)) continue;
    new vm.Script(fs.readFileSync(path.join(root, dir, file), 'utf8'), { filename: file });
    checked++;
  }
}
function inspect(dir) {
  for (const file of fs.readdirSync(dir, { withFileTypes: true })) {
    const target = path.join(dir, file.name);
    assert.ok(!file.isSymbolicLink(), `Unexpected symlink: ${file.name}`);
    if (file.isDirectory()) { inspect(target); continue; }
    bytes += fs.statSync(target).size;
    assert.ok(!file.name.startsWith('.env'), 'Environment file included');
    if (!/\.(html|js|css|json)$/.test(file.name)) continue;
    const content = fs.readFileSync(target, 'utf8');
    assert.ok(!/sb_secret_|SUPABASE_SECRET_KEY|ABUSE_HASH_SECRET/.test(content), `Secret marker in ${file.name}`);
    if (!file.name.endsWith('.html')) continue;
    for (const match of content.matchAll(/(?:src|href)="([^"]+)"/g)) {
      const url = match[1].split(/[?#]/)[0];
      if (!url || /^(https?:|mailto:|tel:|data:|blob:)/.test(url)) continue;
      assert.ok(fs.existsSync(path.resolve(output, url)), `Missing reference: ${url}`);
    }
  }
}
inspect(output);
for (const file of ['assets/catalog/WGA-Decoration-Catalogue.pdf', 'assets/hero-wga-bali.png']) {
  assert.ok(fs.existsSync(path.join(root, file)), 'Original source must be retained');
  assert.ok(!fs.existsSync(path.join(output, file)), 'Source-only asset included in output');
}
for (const dir of ['server', 'api', 'tmp', 'node_modules', 'supabase'])
  assert.ok(!fs.existsSync(path.join(output, dir)), `Private/development folder included: ${dir}`);
console.log(JSON.stringify({ syntaxFiles: checked, publicMiB: (bytes / 1048576).toFixed(2), assetReferences: 'PASS', publicAllowlist: 'PASS', originalAssetsRetained: true }));
