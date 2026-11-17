import { chromium } from 'playwright-core';
import fs from 'fs';
const BASE = 'http://localhost:8080', SHOTS = process.argv[2];
const tokens = JSON.parse(fs.readFileSync(new URL('./tokens.json', import.meta.url)));
const results = []; const check = (n, ok, d = '') => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${d ? '  — ' + d : ''}`); };
const browser = await chromium.launch({ channel: 'chrome', headless: true });
async function session(label, token, viewport = { width: 1280, height: 900 }) {
  const ctx = await browser.newContext({ viewport });
  if (token) await ctx.addInitScript((t) => { if (!sessionStorage.getItem('seeded')) { localStorage.setItem('auth_token', t); sessionStorage.setItem('seeded', '1'); } }, token);
  const page = await ctx.newPage();
  const errors = [], failed = [], publicReqs = [], mediaReqs = [];
  page.on('console', m => m.type() === 'error' && errors.push(m.text()));
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('request', r => { const u = new URL(r.url()); if (u.pathname.startsWith('/api/public/')) publicReqs.push({ url: u.pathname, auth: r.headers()['authorization'] ?? null }); if (u.pathname.startsWith('/api/media/')) mediaReqs.push(u.pathname); });
  page.on('response', r => r.status() >= 400 && failed.push(`${r.status()} ${r.request().method()} ${new URL(r.url()).pathname}`));
  return { ctx, page, errors, failed, publicReqs, mediaReqs, label };
}
const noindex = (p) => p.evaluate(() => document.head.querySelectorAll('meta[name="robots"][content="noindex"]').length);
const h1 = (p) => p.getByRole('heading', { level: 1 }).first();

const s = await session('anonymous', null); const { page } = s;
// from Discover card
await page.goto(BASE + '/discover?category=travel');
await page.getByTestId('collection-card').first().waitFor();
await page.locator('[data-testid=collection-card]', { hasText: 'Porto by tram' }).click();
await page.waitForURL('**/@admin/porto');
await h1(page).waitFor();
check('Opens from a Discover card', (await h1(page).innerText()) === 'Porto by tram', page.url());
check('Document title', (await page.title()) === 'Porto by tram · AlgoQuest', await page.title());
// cover for anonymous visitor
const cover = page.getByTestId('collection-cover');
await page.waitForFunction(() => { const i = document.querySelector('[data-testid=collection-cover]'); return i && i.complete && i.naturalWidth > 0; }, null, { timeout: 8000 }).catch(() => {});
const coverInfo = await cover.evaluate(i => ({ src: i.getAttribute('src'), w: i.naturalWidth, h: i.naturalHeight }));
check('Uploaded cover renders for an anonymous visitor via public media', /^\/api\/public\/media\/[0-9a-f-]+$/.test(coverInfo.src) && coverInfo.w > 0, JSON.stringify(coverInfo));
const coverResp = await page.request.get(BASE + coverInfo.src); 
check('Cover response is public image (200, image/*)', coverResp.status() === 200 && /^image\//.test(coverResp.headers()['content-type']), `${coverResp.status()} ${coverResp.headers()['content-type']}`);
check('Header: category link, description, byline, counts', (await page.getByRole('link', { name: 'Travel' }).getAttribute('href')) === '/discover?category=travel'
  && await page.getByText('Trams, tiles and port wine.').isVisible() && await page.getByText('Admin', { exact: true }).isVisible() && await page.getByText('2 modules · 3 pages').isVisible());
// outline = API order, published only
const api = await (await page.request.get(BASE + '/api/public/collections/admin/porto')).json();
const apiOrder = api.modules.flatMap(m => m.pages.map(p => `/@admin/porto/${m.slug}/${p.slug}`));
const uiOrder = await page.getByRole('navigation', { name: 'Collection contents' }).getByRole('link').evaluateAll(as => as.map(a => a.getAttribute('href')));
check('Outline matches API order (published pages only)', JSON.stringify(uiOrder) === JSON.stringify(apiOrder) && !uiOrder.some(h => h.includes('secret-draft')), uiOrder.join(' '));
await page.screenshot({ path: SHOTS + '/01-collection.png', fullPage: true });
// start reading
await page.getByRole('link', { name: 'Start reading' }).click();
await page.waitForURL('**/@admin/porto/day-one/arrival');
check('"Start reading" opens the first page URL (14c placeholder expected)', page.url().endsWith('/@admin/porto/day-one/arrival'));
await page.goBack(); await h1(page).waitFor();
await page.goBack(); await page.getByTestId('collection-card').first().waitFor();
check('Back returns to Discover with its filter', page.url().endsWith('/discover?category=travel'));
// direct + refresh
await page.goto(BASE + '/@admin/porto'); await h1(page).waitFor(); await page.reload(); await h1(page).waitFor();
check('Direct link and refresh work', (await h1(page).innerText()) === 'Porto by tram');
await page.goto(BASE + '/@ADMIN/porto'); await h1(page).waitFor();
check('Uppercase handle works; links stay canonical', (await page.getByRole('link', { name: 'Start reading' }).getAttribute('href')) === '/@admin/porto/day-one/arrival');
// category link
await page.getByRole('link', { name: 'Travel' }).click(); await page.waitForURL('**/discover?category=travel');
check('Category badge opens Discover filtered', true, page.url());
// unlisted
await page.goto(BASE + '/@admin/secret-recipe'); await h1(page).waitFor();
check('Unlisted collection opens by direct link', (await h1(page).innerText()) === 'Secret family recipe');
check('Unlisted: noindex present, no "Unlisted" label', (await noindex(page)) === 1 && !(await page.locator('main, section').first().innerText()).toLowerCase().includes('unlisted'));
await page.screenshot({ path: SHOTS + '/02-unlisted.png' });
await page.getByRole('main').getByRole('link', { name: 'Discover', exact: true }).click(); await page.getByTestId('collection-card').first().waitFor();
check('noindex removed after leaving the unlisted collection (client navigation)', (await noindex(page)) === 0);
const allTitles = [];
for (let pg = 1; pg <= 2; pg++) { await page.goto(`${BASE}/discover${pg > 1 ? '?page=' + pg : ''}`); await page.getByTestId('collection-card').first().waitFor(); await page.locator('[aria-busy=false]').first().waitFor(); allTitles.push(...await page.locator('[data-testid=collection-card] h2').allInnerTexts()); }
check('Unlisted not in Discover; deleted not in Discover', !allTitles.includes('Secret family recipe') && !allTitles.includes('Oslo on a budget') && allTitles.includes('Porto by tram'), `${allTitles.length} listed`);
await page.goto(BASE + '/@admin/porto'); await h1(page).waitFor();
check('Listed collection has no noindex', (await noindex(page)) === 0);
// not available cases
for (const [label, path] of [['draft', '/@admin/draft-trip'], ['deleted', '/@admin/oslo'], ['mistyped slug', '/@admin/no-such-thing'], ['unknown creator', '/@nobody123/porto']]) {
  await page.goto(BASE + path);
  const na = page.getByTestId('not-available'); await na.waitFor({ timeout: 8000 }).catch(() => {});
  const txt = await na.innerText().catch(() => '');
  check(`${label} → neutral not-available screen; title hides the name`, txt.startsWith("This collection isn't available") && (await page.title()) === 'Not available · AlgoQuest' && (await noindex(page)) === 0, `${path}: "${txt.split('\n')[0]}" / ${await page.title()}`);
}
await page.screenshot({ path: SHOTS + '/03-not-available.png' });
await page.goto(BASE + '/admin-without-at/porto'); await page.waitForTimeout(800);
check('Invalid handle (no @) → NotFound, no API request', !s.publicReqs.some(r => r.url.includes('admin-without-at')), await page.locator('h1').first().innerText().catch(() => ''));
// mobile
await page.setViewportSize({ width: 360, height: 780 }); await page.goto(BASE + '/@admin/porto'); await h1(page).waitFor();
const ov = await page.evaluate(() => [document.documentElement.scrollWidth, innerWidth]);
check('No horizontal overflow at 360px', ov[0] <= ov[1], JSON.stringify(ov));
await page.screenshot({ path: SHOTS + '/04-mobile.png', fullPage: true });
const sessions = [s];
for (const [label, tok] of [['valid token', tokens.valid], ['expired token', tokens.expired]]) {
  const t = await session(label, tok);
  await t.page.goto(BASE + '/@admin/porto'); await h1(t.page).waitFor({ timeout: 10000 }).catch(() => {});
  const ok = (await h1(t.page).innerText().catch(() => '')) === 'Porto by tram';
  const coverOk = await t.page.waitForFunction(() => { const i = document.querySelector('[data-testid=collection-cover]'); return i && i.naturalWidth > 0; }, null, { timeout: 8000 }).then(() => true).catch(() => false);
  check(`Collection works with ${label} (header + cover)`, ok && coverOk, `stored token after: ${(await t.page.evaluate(() => localStorage.getItem('auth_token'))) ? 'kept' : 'cleared'}`);
  sessions.push(t);
}
for (const x of sessions) {
  const withAuth = x.publicReqs.filter(r => r.auth);
  check(`[${x.label}] no public request sent Authorization; no owner-media request`, withAuth.length === 0 && x.publicReqs.length > 0 && x.mediaReqs.length === 0, `${x.publicReqs.length} public requests, ${withAuth.length} with Authorization, owner-media=${x.mediaReqs.length}`);
  // Expected 404s: the deliberate not-available checks (anonymous session). Expected 401: expired session's /auth/me check.
  const expectedFailed = x.label === 'anonymous' ? ['404 GET /api/public/collections/admin/draft-trip', '404 GET /api/public/collections/admin/oslo', '404 GET /api/public/collections/admin/no-such-thing', '404 GET /api/public/collections/nobody123/porto']
    : x.label === 'expired token' ? ['401 GET /api/auth/me'] : [];
  const extraFailed = x.failed.filter(f => !expectedFailed.includes(f));
  // plus the existing NotFound page's own log for the deliberate invalid-handle visit (anonymous session only)
  const expectedLog = (e) => x.label === 'anonymous' && e === '404 Error: User attempted to access non-existent route: /admin-without-at/porto';
  const extraErrors = x.errors.filter(e => !expectedLog(e)).filter(e => !/Failed to load resource: the server responded with a status of (404|401)/.test(e) || x.label === 'valid token');
  const resourceErrors = x.errors.length - extraErrors.length;
  check(`[${x.label}] no unexpected console errors / failed requests`, extraFailed.length === 0 && extraErrors.length === 0 && resourceErrors - x.errors.filter(expectedLog).length === x.failed.length - extraFailed.length,
    `unexpected failed=${JSON.stringify(extraFailed)} unexpected errors=${JSON.stringify(extraErrors)}; expected-and-seen=${JSON.stringify(x.failed.filter(f => expectedFailed.includes(f)))}`);
}
console.log(`\nTOTAL ${results.filter(Boolean).length}/${results.length} passed`);
await browser.close();
