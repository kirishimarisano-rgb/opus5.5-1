// Render checkpoint-2 style frames:  node tools/style.mjs [names...]  → docs/checkpoint2/
import fs from 'node:fs'; import path from 'node:path';
import { serve, launch, ROOT } from './server.mjs';
const out = path.join(ROOT, 'docs/checkpoint2'); fs.mkdirSync(out, { recursive: true });
const { srv, url } = await serve(); const b = await launch(); const p = await b.newPage();
p.on('pageerror', (e) => console.log('[pageerror]', e.message)); p.on('console', (m) => { if (!m.text().includes('stall')) console.log('[page]', m.text()); });
await p.goto(`${url}/web/style.html`); await p.waitForFunction(() => window.ready, null, { timeout: 120000 });
const names = process.argv.slice(2).length ? process.argv.slice(2) : await p.evaluate(() => window.frames);
for (const n of names) { const d = await p.evaluate((n) => window.renderFrame(n), n); fs.writeFileSync(path.join(out, `${n}.png`), Buffer.from(d.split(',')[1], 'base64')); console.log(n); }
await b.close(); srv.close();
