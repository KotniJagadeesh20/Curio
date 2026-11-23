// A11Y: mobile menu wrapper check at 360 px (reviewer's verification points), logged-out, Discover + a public page.
// Usage: node tmenu.mjs <label> [--geometry-only]
//   --geometry-only: only record closed-state geometry (used on the OLD code, which has no #mobile-nav-panel / labels).
// Checks (new code):
//   M1 closed: #mobile-nav-panel exists, has [hidden], has no box, and exposes nothing to the accessibility tree.
//   M2 aria-expanded flips to "true" synchronously with the click (read in the same task as the click's effects), panel shown.
//   M3 closing: aria-expanded is "false" right after the click, the panel is still visible mid-animation (collapse kept),
//      then [hidden] after the exit animation, no accessible content, same element throughout.
//   M4 no horizontal overflow at 360 px (closed, open, after close); closed-state geometry recorded for old/new comparison.
import { chromium } from 'playwright-core';
const BASE = 'http://localhost:8080';
const label = process.argv[2] || 'run'; const geomOnly = process.argv.includes('--geometry-only');
const results = []; const check = (n, ok, d = '') => { results.push(!!ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${d ? '  — ' + d : ''}`); };
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const geom = (p) => p.evaluate(() => {
  const h = document.querySelector('header'); const m = document.querySelector('main') || document.querySelector('h1');
  return { scrollW: document.documentElement.scrollWidth, clientW: document.documentElement.clientWidth,
    headerH: Math.round(h?.getBoundingClientRect().height ?? -1), contentTop: Math.round(m?.getBoundingClientRect().top ?? -1) };
});
for (const path of ['/discover', '/']) {
  const ctx = await browser.newContext({ viewport: { width: 360, height: 780 } }); const p = await ctx.newPage();
  const errs = []; p.on('pageerror', (e) => errs.push(e.message));
  await p.goto(BASE + path); await p.waitForLoadState('networkidle'); await p.waitForTimeout(800);
  const g0 = await geom(p); console.log(`GEOM  [${label}] ${path} closed: ${JSON.stringify(g0)}`);
  if (geomOnly) { await ctx.close(); continue; }
  const btn = p.locator('header button[aria-controls="mobile-nav-panel"]');
  const panelState = () => p.evaluate(() => {
    const el = document.getElementById('mobile-nav-panel'); if (!el) return { exists: false };
    const r = el.getBoundingClientRect();
    return { exists: true, hidden: el.hasAttribute('hidden'), h: Math.round(r.height), links: el.querySelectorAll('a').length };
  });
  const axLinks = async () => { const n = await p.accessibility.snapshot({ root: await p.$('#mobile-nav-panel'), interestingOnly: false }).catch(() => null); return n ? JSON.stringify(n).match(/"role":"link"/g)?.length ?? 0 : 0; };
  const s0 = await panelState(); const ax0 = await axLinks();
  check(`[M1 ${path}] closed: panel exists, [hidden], no box, nothing exposed to AT`, s0.exists && s0.hidden && s0.h === 0 && ax0 === 0 && (await btn.getAttribute('aria-expanded')) === 'false', JSON.stringify({ ...s0, axLinks: ax0 }));
  const id0 = await p.evaluateHandle(() => document.getElementById('mobile-nav-panel'));
  // M2 open: read aria-expanded in the same task right after the click is dispatched.
  const exp1 = await btn.evaluate((b) => { b.click(); return null; }).then(() => btn.getAttribute('aria-expanded'));
  await p.waitForTimeout(600); const s1 = await panelState();
  check(`[M2 ${path}] open: aria-expanded "true" immediately, name "Close menu", panel visible with links`, exp1 === 'true' && (await btn.getAttribute('aria-label')) === 'Close menu' && !s1.hidden && s1.h > 0 && s1.links > 0, JSON.stringify({ exp1, ...s1 }));
  const g1 = await geom(p);
  // M3 close.
  const exp2 = await btn.evaluate((b) => { b.click(); return null; }).then(() => btn.getAttribute('aria-expanded'));
  await p.waitForTimeout(80); const mid = await panelState();
  await p.waitForTimeout(900); const s2 = await panelState(); const ax2 = await axLinks();
  const same = await p.evaluate((el) => el === document.getElementById('mobile-nav-panel'), id0);
  check(`[M3 ${path}] close: aria-expanded "false" immediately; still visible mid-animation; then [hidden], no box, nothing exposed; same element`,
    exp2 === 'false' && !mid.hidden && mid.h > 0 && s2.hidden && s2.h === 0 && ax2 === 0 && same, JSON.stringify({ exp2, mid, after: s2, axLinks: ax2, same }));
  const g2 = await geom(p);
  check(`[M4 ${path}] no horizontal overflow at 360 px (closed, open, after close); closed geometry unchanged after a cycle`,
    [g0, g1, g2].every((g) => g.scrollW <= g.clientW) && g2.headerH === g0.headerH && g2.contentTop === g0.contentTop, JSON.stringify({ g0, g1, g2 }));
  check(`[M ${path}] no uncaught errors`, errs.length === 0, errs.join(' | '));
  await ctx.close();
}
await browser.close();
const pass = results.filter(Boolean).length; console.log(`\n${pass}/${results.length} checks passed`);
process.exit(pass === results.length ? 0 : 1);
