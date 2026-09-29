// Deletion test: render each candidate with one effect removed at a time.
//   node tools/deletion_test.mjs  → docs/checkpoint1/deletion/{A,B,C}_{full,no-<effect>}.png
import fs from 'node:fs';
import path from 'node:path';
import { serve, launch, ROOT } from './server.mjs';
const out = path.join(ROOT, 'docs/checkpoint1/deletion');
fs.mkdirSync(out, { recursive: true });
const { srv, url } = await serve();
const b = await launch(); const p = await b.newPage();
await p.goto(`${url}/web/still.html`); await p.waitForFunction(() => window.ready, null, { timeout: 120000 });
const tests = { A: [null, 'halo', 'river', 'sap'], B: [null, 'halo', 'river'], C: [null, 'halo', 'river'] };
for (const [w, offs] of Object.entries(tests)) for (const off of offs) {
  const data = await p.evaluate(([w, off]) => window.renderFinal(w, 3.0, null, off), [w, off]);
  fs.writeFileSync(path.join(out, `${w}_${off ? 'no-' + off : 'full'}.png`), Buffer.from(data.split(',')[1], 'base64'));
  console.log(w, off || 'full');
}
await b.close(); srv.close();
