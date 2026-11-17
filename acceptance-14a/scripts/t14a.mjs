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
  const errors = [], failed = [], publicReqs = [], allApi = [];
  page.on('console', m => m.type() === 'error' && errors.push(m.text()));
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('request', r => { const u = new URL(r.url()); if (u.pathname.startsWith('/api/')) { allApi.push(`${r.method()} ${u.pathname}${u.search}`); if (u.pathname.startsWith('/api/public/')) publicReqs.push({ url: u.pathname + u.search, auth: r.headers()['authorization'] ?? null }); } });
  page.on('response', r => r.status() >= 400 && failed.push(`${r.status()} ${r.request().method()} ${new URL(r.url()).pathname}`));
  return { ctx, page, errors, failed, publicReqs, allApi, label };
}
const cards = (p) => p.getByTestId('collection-card');
const settled = (p) => p.locator('[aria-busy=false]').first().waitFor({ timeout: 10000 });
const titles = async (p) => { await settled(p); return p.locator('[data-testid=collection-card] h2').allInnerTexts(); };
const listReqs = (s) => s.publicReqs.filter(r => r.url.startsWith('/api/public/collections'));

// ---------- main walkthrough (anonymous) ----------
const s = await session('anonymous', null);
const { page } = s;
await page.goto(BASE + '/discover');
await cards(page).first().waitFor();
check('/discover loads with collections', (await cards(page).count()) === 12, `${await cards(page).count()} cards on page 1; title="${await page.title()}"`);
check('Count shows all listed collections (UNLISTED and DRAFT excluded)', await page.getByText('15 collections').isVisible());
const all1 = await titles(page);
check('Unlisted/draft collections not shown', !all1.includes('Secret family recipe') && !all1.includes('Draft trip notes'));
await page.screenshot({ path: SHOTS + '/01-discover.png', fullPage: true });

// search, debounced
const before = listReqs(s).length;
const box = page.getByRole('searchbox', { name: 'Search collections' });
await box.click(); await page.keyboard.type('kyo', { delay: 40 });
await page.waitForTimeout(100);
const midUrl = page.url();
await page.waitForTimeout(600);
await page.waitForFunction(() => location.search.includes('q=kyo'));
await page.getByText('1 collection').waitFor();
const searchReqs = listReqs(s).slice(before).map(r => r.url);
check('Search is debounced (no request per keystroke; URL waits for the pause)', !midUrl.includes('q=') && searchReqs.length === 1 && searchReqs[0].includes('q=kyo'), `requests while typing: ${JSON.stringify(searchReqs)}`);
check('Search filters results', JSON.stringify(await titles(page)) === JSON.stringify(['Kyoto temples']), (await titles(page)).join(','));
await page.screenshot({ path: SHOTS + '/02-search.png' });
// clear search via box
await box.fill(''); await page.waitForFunction(() => !location.search.includes('q='));
await page.getByText('15 collections').waitFor();

// category
await page.getByRole('group', { name: 'Categories' }).getByRole('button', { name: 'Travel' }).click();
await page.waitForFunction(() => location.search === '?category=travel');
await page.getByText('4 collections').waitFor();
const travel = await titles(page);
check('Category filter (Travel)', travel.length === 4 && travel.every(t => /Lisbon|Kyoto|Oslo|Lima/.test(t)), travel.join(','));
check('Chip shows pressed state', (await page.getByRole('button', { name: 'Travel' }).getAttribute('aria-pressed')) === 'true');
await page.screenshot({ path: SHOTS + '/03-category.png' });
// category + search combined
await box.fill('lima'); await page.waitForFunction(() => location.search.includes('q=lima'));
await page.getByText('1 collection').waitFor();
check('Search combined with category', JSON.stringify(await titles(page)) === '["Lima food walk"]', page.url());
await box.fill(''); await page.waitForFunction(() => !location.search.includes('q='));
await page.getByRole('button', { name: 'All', exact: true }).click();
await page.waitForFunction(() => location.search === '');

// pagination: Programming has 9 -> no pager; All has 15 -> 2 pages. Filter preserved: use search "a" (broad) to get >12? use All + page
await page.getByText('Page 1 of 2').waitFor();
await page.getByRole('button', { name: /Next/ }).click();
await page.waitForFunction(() => location.search === '?page=2');
await page.getByText('Page 2 of 2').waitFor();
const p2 = await titles(page);
check('Pagination: page 2 shows the remaining 3, none repeated', p2.length === 3 && p2.every(t => !all1.includes(t)), p2.join(','));
check('Pagination request is 0-based', listReqs(s).some(r => r.url.includes('page=1&size=12')));
await page.screenshot({ path: SHOTS + '/04-page2.png', fullPage: true });
// filters preserved across paging: search 'o' (matches many) then page
await page.goto(BASE + '/discover?q=e');
await cards(page).first().waitFor();
const eCount = await page.locator('p[aria-live=polite]').innerText();
const hasPager = await page.getByRole('navigation', { name: 'Pagination' }).count();
if (hasPager) {
  await page.getByRole('button', { name: /Next/ }).click();
  await page.waitForFunction(() => location.search === '?q=e&page=2');
  check('Paging preserves the search filter', true, `${eCount}; url=${page.url()}`);
} else {
  check('Paging preserves the search filter (needs >12 matches)', false, `${eCount} — not enough matches to page`);
}
// refresh persistence
await page.goto(BASE + '/discover?category=travel&q=o');
await cards(page).first().waitFor();
await page.reload(); await cards(page).first().waitFor();
const restored = { q: await box.inputValue(), travel: await page.getByRole('button', { name: 'Travel' }).getAttribute('aria-pressed'), titles: await titles(page) };
check('State survives refresh (q + category)', restored.q === 'o' && restored.travel === 'true' && restored.titles.every(t => /o/i.test(t)), JSON.stringify(restored));
await page.goto(BASE + '/discover?page=2'); await cards(page).first().waitFor(); await page.reload(); await cards(page).first().waitFor();
check('Page number survives refresh', await page.getByText('Page 2 of 2').isVisible());

// back/forward
await page.goto(BASE + '/discover');
await cards(page).first().waitFor();
await page.getByRole('button', { name: 'Food & Recipes' }).click(); await page.waitForFunction(() => location.search === '?category=food');
await page.getByText('2 collections').waitFor();
await page.getByRole('button', { name: 'Travel' }).click(); await page.waitForFunction(() => location.search === '?category=travel');
await page.getByText('4 collections').waitFor();
await page.goBack(); await page.waitForFunction(() => location.search === '?category=food');
await page.getByText('2 collections').waitFor();
const backOk = (await page.getByRole('button', { name: 'Food & Recipes' }).getAttribute('aria-pressed')) === 'true';
await page.goBack(); await page.waitForFunction(() => location.search === '');
await page.getByText('15 collections').waitFor();
await page.goForward(); await page.waitForFunction(() => location.search === '?category=food');
await page.getByText('2 collections').waitFor();
check('Back/forward restore filters and results', backOk, page.url());
// typing doesn't flood history
await page.goto(BASE + '/discover'); await cards(page).first().waitFor();
await box.click(); await page.keyboard.type('pasta', { delay: 30 }); await page.waitForFunction(() => location.search === '?q=pasta');
await page.getByText('1 collection').waitFor();
await page.goBack(); await page.waitForTimeout(500);
check('Typed search replaces (not pushes) history entries', !page.url().includes('/discover?q=p'), `after Back: ${page.url()}`);

// card navigation
await page.goto(BASE + '/discover?q=kyoto'); await cards(page).first().waitFor();
const href = await cards(page).first().getAttribute('href');
await cards(page).first().click();
await page.waitForURL('**/@admin/kyoto');
check('Card navigates to the collection URL', href === '/@admin/kyoto' && page.url().endsWith('/@admin/kyoto'), `${href} → ${page.url()} (14b placeholder expected)`);
await page.goBack(); await cards(page).first().waitFor();
check('Back from collection returns to the filtered Discover', page.url().endsWith('/discover?q=kyoto'));
// mobile layout
await page.setViewportSize({ width: 360, height: 780 }); await page.goto(BASE + '/discover'); await cards(page).first().waitFor();
const ov = await page.evaluate(() => [document.documentElement.scrollWidth, innerWidth]);
check('No horizontal overflow at 360px', ov[0] <= ov[1], JSON.stringify(ov));
await page.screenshot({ path: SHOTS + '/05-mobile.png', fullPage: false });
const sessions = [s];

// ---------- token variants ----------
for (const [label, tok] of [['valid token', tokens.valid], ['expired token', tokens.expired]]) {
  const t = await session(label, tok);
  await t.page.goto(BASE + '/discover');
  await cards(t.page).first().waitFor({ timeout: 10000 }).catch(() => {});
  const n = await cards(t.page).count();
  await t.page.getByRole('button', { name: 'Travel' }).click(); await t.page.getByText('4 collections').waitFor().catch(() => {});
  const stored = await t.page.evaluate(() => localStorage.getItem('auth_token'));
  check(`Discover works with ${label}`, n === 12 && (await titles(t.page)).length === 4, `cards=${n}; stored token after: ${stored ? 'kept' : 'cleared'}; non-public API calls: ${JSON.stringify(t.allApi.filter(a => !a.includes('/api/public/')))}`);
  await t.page.screenshot({ path: `${SHOTS}/06-${label.replace(' ', '-')}.png` });
  sessions.push(t);
}
for (const x of sessions) {
  const withAuth = x.publicReqs.filter(r => r.auth);
  check(`[${x.label}] no public request sent Authorization`, withAuth.length === 0 && x.publicReqs.length > 0, `${x.publicReqs.length} public requests, ${withAuth.length} with Authorization`);
  // Expected and allowed ONLY for the expired-token session: the app's existing session check rejecting the stale token
  // (not a public request; unchanged auth behaviour). Anything else fails.
  const expected = x.label === 'expired token' ? { failed: ['401 GET /api/auth/me'], errors: ['Failed to load resource: the server responded with a status of 401 (Unauthorized)'] } : { failed: [], errors: [] };
  const extraFailed = x.failed.filter(f => !expected.failed.includes(f)), extraErrors = x.errors.filter(e => !expected.errors.includes(e));
  check(`[${x.label}] no unexpected console errors / failed requests`, extraFailed.length === 0 && extraErrors.length === 0 && x.failed.filter(f => f.includes('/api/public/')).length === 0,
    `unexpected errors=${JSON.stringify(extraErrors)} unexpected failed=${JSON.stringify(extraFailed)}; expected-and-seen=${JSON.stringify(x.failed.filter(f => expected.failed.includes(f)))}`);
}
console.log(`\nTOTAL ${results.filter(Boolean).length}/${results.length} passed`);
await browser.close();
