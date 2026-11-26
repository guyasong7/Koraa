// Screenshot pages and report any icon that rendered as an empty <svg>.
// A wrong `icon` prop on HugeiconsIcon is silent: the component still
// mounts, so only counting child nodes catches it.
import { chromium } from 'playwright';

const pages = process.argv.slice(2);
const base = 'http://127.0.0.1:3111';

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await ctx.newPage();

const consoleErrors = [];
page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });
page.on('pageerror', (e) => consoleErrors.push('pageerror: ' + e.message));

for (const p of pages) {
  const before = consoleErrors.length;
  await page.goto(base + p, { waitUntil: 'networkidle', timeout: 45000 });
  await page.waitForTimeout(700);

  const svgs = await page.evaluate(() => {
    const out = { total: 0, empty: 0, emptyContext: [] };
    for (const s of document.querySelectorAll('svg')) {
      out.total++;
      // An icon with valid data has drawable children.
      if (s.querySelectorAll('path,circle,rect,line,polyline,polygon,ellipse').length === 0) {
        out.empty++;
        if (out.emptyContext.length < 6) {
          const host = s.closest('button,a,div,span');
          out.emptyContext.push((host?.textContent || '').trim().slice(0, 45) || '(no text)');
        }
      }
    }
    return out;
  });

  const slug = p === '/' ? 'root' : p.replace(/\//g, '_').replace(/^_/, '');
  await page.screenshot({ path: `/tmp/shot-${slug}.png`, fullPage: false });

  const errs = consoleErrors.slice(before);
  console.log(
    `${p.padEnd(24)} svg=${String(svgs.total).padStart(3)} empty=${svgs.empty}` +
    ` console=${errs.length}` +
    (svgs.empty ? `\n    ⚠ empty near: ${svgs.emptyContext.join(' | ')}` : '') +
    (errs.length ? `\n    ⚠ ${errs.slice(0, 3).join('\n    ⚠ ')}` : ''),
  );
}

await browser.close();
