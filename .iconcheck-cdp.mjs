// Same check as .iconcheck.mjs but driven through Chrome's DevTools
// Protocol over a websocket, so it needs no Playwright install.
import { writeFileSync } from 'node:fs';

const base = 'http://127.0.0.1:3111';
const pages = process.argv.slice(2);
const CDP = 'http://127.0.0.1:9222';

const targets = await (await fetch(`${CDP}/json/list`)).json();
const target = targets.find((t) => t.type === 'page');
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((r) => (ws.onopen = r));

let id = 0;
const pending = new Map();
ws.onmessage = (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
};
const send = (method, params = {}) =>
  new Promise((res) => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });

await send('Page.enable');
await send('Runtime.enable');

const PROBE = `(() => {
  const out = { total: 0, empty: 0, ctx: [] };
  for (const s of document.querySelectorAll('svg')) {
    out.total++;
    if (s.querySelectorAll('path,circle,rect,line,polyline,polygon,ellipse').length === 0) {
      out.empty++;
      if (out.ctx.length < 6) {
        const h = s.closest('button,a,div,span');
        out.ctx.push((h?.textContent || '').trim().slice(0, 45) || '(no text)');
      }
    }
  }
  return JSON.stringify(out);
})()`;

for (const p of pages) {
  await send('Page.navigate', { url: base + p });
  await new Promise((r) => setTimeout(r, 3500));
  const r = await send('Runtime.evaluate', { expression: PROBE, returnByValue: true });
  const v = JSON.parse(r.result.result.value);
  const shot = await send('Page.captureScreenshot', { format: 'png' });
  const slug = p === '/' ? 'root' : p.replace(/\//g, '_').replace(/^_/, '');
  writeFileSync(`/tmp/shot-${slug}.png`, Buffer.from(shot.result.data, 'base64'));
  console.log(
    `${p.padEnd(24)} svg=${String(v.total).padStart(3)} empty=${v.empty}` +
    (v.empty ? `\n    EMPTY near: ${v.ctx.join(' | ')}` : ''),
  );
}
ws.close();
