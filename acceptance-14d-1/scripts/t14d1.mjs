// Step 14d-1 targeted browser checks: moved public route adapters + workspace links to the public viewers.
// Uses the 14c seed (seed14c.mjs). Non-mutating. Usage: node t14d1.mjs <screenshots dir>
import { chromium } from 'playwright-core';
import fs from 'fs';
const BASE = 'http://localhost:8080', API = 'http://localhost:8081/api', SHOTS = process.argv[2];
const seed = JSON.parse(fs.readFileSync(new URL('./seed14c.json', import.meta.url)));
const results = [];
const check = (n, ok, d = '') => { results.push(!!ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${d ? '  — ' + d : ''}`); };
const mine = await (await fetch(API + '/collections/mine', { headers: { Authorization: 'Bearer ' + seed.token } })).json();
const id = (slug) => mine.find((c) => c.slug === slug).id;

const browser = await chromium.launch({ channel: 'chrome', headless: true });
async function session(token) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  if (token) await ctx.addInitScript((t) => { if (!sessionStorage.getItem('seeded')) { localStorage.setItem('auth_token', t); sessionStorage.setItem('seeded', '1'); } }, token);
  const page = await ctx.newPage();
  const s = { ctx, page, errors: [], failed: [], mediaReqs: [] };
  page.on('console', (m) => m.type() === 'error' && s.errors.push(m.text()));
  page.on('pageerror', (e) => s.errors.push('pageerror: ' + e.message));
  page.on('request', (r) => { if (new URL(r.url()).pathname.startsWith('/api/media/')) s.mediaReqs.push(r.url()); });
  page.on('response', (r) => { const u = new URL(r.url()); if (r.status() >= 400 && /localhost:808[01]/.test(u.host)) s.failed.push(`${r.status()} ${u.pathname}`); });
  return s;
}
const h1 = (p, name) => p.getByRole('heading', { level: 1, name }).waitFor({ timeout: 10000 });
const editor = async (p, slug) => { await p.goto(`${BASE}/create/collections/${id(slug)}`); await p.getByRole('heading', { name: 'Day one' }).or(p.getByRole('heading', { name: 'Dough' })).or(p.getByRole('heading', { name: 'Plan' })).first().waitFor({ timeout: 10000 }); };
const pageLinks = (p) => p.getByRole('link', { name: /on the public site$/ });

// ---- signed-in creator (admin owns the seeded collections)
const C = await session(seed.token);
let p = C.page;
await editor(p, 'lisbon');
const colHref = await p.getByRole('link', { name: 'View public page' }).getAttribute('href');
check('Collection editor (published): "View public page" → /@admin/lisbon', colHref === '/@admin/lisbon', colHref);
const hrefs = await pageLinks(p).evaluateAll((as) => as.map((a) => a.getAttribute('href')));
check('Per-page "View" links: one per PUBLISHED page, module-qualified; none for the draft page',
  JSON.stringify(hrefs) === JSON.stringify(['/@admin/lisbon/day-one/arrival', '/@admin/lisbon/day-one/tram-28', '/@admin/lisbon/day-two/belem']) && !hrefs.some((h) => h.includes('secret-draft')), hrefs.join(' '));
check('Per-page link accessible name and visible text', (await p.getByRole('link', { name: 'View Arrival on the public site' }).innerText()).trim() === 'View');
await p.screenshot({ path: SHOTS + '/01-editor-public-links.png', fullPage: true });
await p.getByRole('link', { name: 'View public page' }).click();
await h1(p, 'Lisbon in 3 days');
check('"View public page" opens the real collection viewer', p.url().endsWith('/@admin/lisbon'));
await p.goBack(); await pageLinks(p).first().waitFor();
await p.getByRole('link', { name: 'View Tram 28 on the public site' }).click();
await h1(p, 'Tram 28');
check('Per-page "View" opens the real page viewer (content + outline)', p.url().endsWith('/@admin/lisbon/day-one/tram-28')
  && await p.getByTestId('page-sidebar').getByRole('navigation', { name: 'Collection contents' }).isVisible());
await p.screenshot({ path: SHOTS + '/02-view-opens-page.png' });
await p.goBack(); await pageLinks(p).first().waitFor();
check('Back returns to the collection editor', p.url().endsWith(`/create/collections/${id('lisbon')}`));

await editor(p, 'secret-recipe');
check('Unlisted collection: collection link + per-page links shown', (await p.getByRole('link', { name: 'View public page' }).count()) === 1 && (await pageLinks(p).count()) === 2);
await p.getByRole('link', { name: 'View Resting on the public site' }).click();
await h1(p, 'Resting');
check('Unlisted per-page link opens the page (by link)', p.url().endsWith('/@admin/secret-recipe/dough/resting'));

await editor(p, 'draft-trip');
check('Draft collection: no collection link and no per-page links (even for its published page)', (await p.getByRole('link', { name: 'View public page' }).count()) === 0 && (await pageLinks(p).count()) === 0);
await p.screenshot({ path: SHOTS + '/03-draft-no-links.png', fullPage: true });
check('Creator session: no /api/media/* requests, no console errors, no failed requests', C.mediaReqs.length === 0 && C.errors.length === 0 && C.failed.length === 0, [...C.errors, ...C.failed].slice(0, 3).join(' | '));
await C.ctx.close();

// ---- moved route adapters (anonymous): behavior unchanged
const A = await session(null);
p = A.page;
await p.goto(BASE + '/@ADMIN/lisbon'); await h1(p, 'Lisbon in 3 days');
check('Moved collection adapter: uppercase handle accepted (lower-cased)', (await p.getByRole('link', { name: 'Start reading' }).getAttribute('href')) === '/@admin/lisbon/day-one/arrival');
await p.goto(BASE + '/@ADMIN/lisbon/day-one/arrival'); await h1(p, 'Arrival');
check('Moved page adapter: uppercase handle accepted; page renders', true);
const notFound = [];
for (const path of ['/admin/lisbon', '/admin/lisbon/day-one/arrival', '/@ab/lisbon', '/@al-ice/lisbon/day-one/arrival']) {
  await p.goto(BASE + path); await p.getByText('Oops! Page not found').waitFor({ timeout: 8000 }).catch(() => {});
  if (!(await p.getByText('Oops! Page not found').isVisible())) notFound.push(path);
}
check('Moved adapters: invalid handles are the app 404 (no API call)', notFound.length === 0, notFound.join(' '));
check('Anonymous: no failed API requests', A.failed.length === 0, A.failed.join(' | '));
await A.ctx.close();

await browser.close();
const pass = results.filter(Boolean).length;
console.log(`\n${pass}/${results.length} checks passed`);
process.exit(pass === results.length ? 0 : 1);
