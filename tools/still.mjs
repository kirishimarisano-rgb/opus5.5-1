// Render candidate final-shape stills:  node tools/still.mjs A B C  [--out dir]
import fs from 'node:fs';
import path from 'node:path';
import { serve, launch, ROOT } from './server.mjs';
const args = process.argv.slice(2);
const outDir = args.includes('--out') ? args[args.indexOf('--out') + 1] : path.join(ROOT, 'docs/checkpoint1');
const which = args.filter((a, i) => !a.startsWith('--') && args[i - 1] !== '--out');
fs.mkdirSync(outDir, { recursive: true });
const { srv, url } = await serve();
const b = await launch();
const p = await b.newPage();
p.on('console', (m) => console.log('[page]', m.text()));
p.on('pageerror', (e) => console.log('[pageerror]', e.message));
await p.goto(`${url}/web/still.html`);
await p.waitForFunction(() => window.ready, null, { timeout: 120000 });
for (const w of which) {
  const t0 = Date.now();
  const data = await p.evaluate((w) => window.renderFinal(w), w);
  const f = path.join(outDir, `final_${w}.png`);
  fs.writeFileSync(f, Buffer.from(data.split(',')[1], 'base64'));
  const det = await p.evaluate((w) => window.renderFinal(w, 3.0, window.seedPos[w]), w);
  fs.writeFileSync(path.join(outDir, `final_${w}_seed.png`), Buffer.from(det.split(',')[1], 'base64'));
  console.log(f, Date.now() - t0, 'ms');
}
await b.close(); srv.close();
