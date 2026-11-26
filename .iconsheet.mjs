// Render a labelled contact sheet of Hugeicons candidates so icon choices
// can be eyeballed instead of guessed from export names.
import * as H from '@hugeicons/core-free-icons';
import { writeFileSync } from 'node:fs';

const names = process.argv.slice(2);

function toSvg(el) {
  if (!el) return '<svg width="40" height="40"></svg>';
  const body = el.map(([tag, attrs]) => {
    const a = Object.entries(attrs)
      .filter(([k]) => k !== 'key')
      .map(([k, v]) => {
        const kebab = k.replace(/[A-Z]/g, (c) => '-' + c.toLowerCase());
        return `${kebab}="${v}"`;
      })
      .join(' ');
    return `<${tag} ${a} />`;
  }).join('');
  return `<svg width="40" height="40" viewBox="0 0 24 24" fill="none">${body}</svg>`;
}

const cells = names.map((n) => {
  const missing = !H[n];
  return `<div class="c${missing ? ' miss' : ''}">
    ${toSvg(H[n])}
    <span>${n.replace(/Icon$/, '')}${missing ? ' ⚠MISSING' : ''}</span>
  </div>`;
}).join('');

writeFileSync('/tmp/iconsheet.html', `<!doctype html><meta charset="utf-8">
<style>
  body { background:#fff; color:#111; font:11px ui-sans-serif,system-ui,sans-serif;
         margin:0; padding:16px; display:flex; flex-wrap:wrap; gap:4px; width:1180px; }
  .c { width:112px; padding:10px 4px; display:flex; flex-direction:column;
       align-items:center; gap:7px; border:1px solid #e5e5e5; border-radius:8px; }
  .c span { text-align:center; line-height:1.25; word-break:break-word; color:#333; }
  .miss { background:#fee; border-color:#f99; }
</style>${cells}`);
console.log('wrote', names.length, 'icons');
