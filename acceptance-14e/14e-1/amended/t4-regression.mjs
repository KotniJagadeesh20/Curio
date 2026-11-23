import { setup, login, check, BASE, SHOTS } from './common.mjs';
import { resolveFixture } from './fixture.mjs';
const { browser, page, errors, failed } = await setup();
const tk = () => page.evaluate(() => localStorage.getItem('auth_token'));
const api = (p, opts = {}) => page.evaluate(async ([p, o]) => { const r = await fetch('/api' + p, { ...o, headers: { 'content-type': 'application/json', Authorization: 'Bearer ' + localStorage.getItem('auth_token') } }); return { status: r.status, body: await r.json().catch(() => null) }; }, [p, opts]);
await login(page);
const { COLL, PAGE } = await resolveFixture(page);
// --- template retry to completion + idempotency ---
await page.goto(BASE + '/create');
await page.getByRole('button', { name: 'New collection' }).click();
const dlg = page.getByRole('dialog');
await page.locator('#template-travel-guide').click();
const rt = `Retry run ${Date.now() % 100000}`;
await page.fill('#c-title', rt);
let posts = 0, fails = 0;
await page.route('**/api/**', (route) => { if (route.request().method() === 'POST' && ++posts === 4 && fails++ === 0) return route.fulfill({ status: 503, contentType: 'application/json', body: '{}' }); return route.continue(); });
await dlg.getByRole('button', { name: 'Create from template' }).click();
await dlg.getByRole('button', { name: 'Retry remaining' }).waitFor({ timeout: 10000 });
const prog = await dlg.getByText(/of \d+ created/).innerText();
// Escape must be possible? record whether dialog closes when not running
await dlg.getByRole('button', { name: 'Retry remaining' }).click();
await page.waitForURL(/\/create\/collections\/\d+/, { timeout: 15000 });
await page.unroute('**/api/**');
const id = Number(page.url().split('/').pop());
const det = await api(`/creator/collections/${id}`).catch(() => null);
await page.waitForTimeout(800);
const pageLinks = await page.locator('a[href^="/create/pages/"]').count() / 2;
const modTitles = await page.locator('h2, h3').allInnerTexts();
check('Retry after mid-run failure completes with exactly the template structure (6 pages)', pageLinks === 6, `progress at failure: "${prog}", pages now ${pageLinks}`);
await page.screenshot({ path: SHOTS + '/12-retry-complete.png', fullPage: true });
// --- existing seeded collection editing ---
await page.goto(BASE + '/create'); await page.waitForTimeout(800);
const seeded = page.locator('ul li a.text-lg', { hasText: 'Kubernetes' }).first();
await seeded.click(); await page.waitForURL(/collections\/\d+/); await page.waitForTimeout(800);
const seededPages = await page.locator('a[href^="/create/pages/"]').count();
check('Existing seeded collection opens in editor', seededPages > 0, `${seededPages / 2} pages`);
await page.locator('a[href^="/create/pages/"]').first().click();
await page.getByTestId('block-editor').waitFor({ timeout: 10000 }).catch(() => {});
const seededBlocks = await page.locator('[data-block-type]').count();
const unsupported = await page.getByTestId('unsupported-block').count();
const statusTxt = await page.getByText(/^(Saved|Unsaved changes.*)$/).first().innerText().catch(() => '?');
check('Existing page loads in block editor without spurious dirty state', seededBlocks > 0 && statusTxt === 'Saved', `blocks=${seededBlocks}, unsupported=${unsupported}, status=${statusTxt}`);
await page.screenshot({ path: SHOTS + '/13-existing-page.png' });
// --- publish test page & public routes ---
await page.goto(BASE + '/create/pages/' + PAGE); await page.getByTestId('block-editor').waitFor();
await page.getByRole('button', { name: 'Publish', exact: true }).click();
await page.waitForTimeout(500);
const confirm = page.getByRole('alertdialog').getByRole('button', { name: /publish/i });
if (await confirm.count()) await confirm.click();
await page.waitForTimeout(1200);
const pg = await api('/pages/' + PAGE);
const coll = await api(`/creator/collections/${COLL}`).then(r => r).catch(() => null);
check('Page publishes', pg.body?.status === 'PUBLISHED', pg.body?.status);
// publish collection
await page.goto(BASE + '/create/collections/' + COLL); await page.waitForTimeout(800);
const pubColl = page.getByRole('button', { name: /^Publish/ }).first();
if (await pubColl.count()) { await pubColl.click(); await page.waitForTimeout(500); const c2 = page.getByRole('alertdialog').getByRole('button', { name: /publish/i }); if (await c2.count()) await c2.click(); await page.waitForTimeout(1200); }
const cd = await page.evaluate(async () => { const r = await fetch('/api/collections/mine', { headers: { Authorization: 'Bearer ' + localStorage.getItem('auth_token') } }); return r.ok ? r.json() : r.status; });
const mine = Array.isArray(cd) ? cd.find(c => c.id === COLL) : null;
console.log('collection ' + COLL, mine?.status, mine?.slug ?? '', typeof cd === 'number' ? cd : '');
const slug = mine?.slug;
// logged-out public views
const anonCtx = await browser.newContext(); const anon = await anonCtx.newPage();
const anonErr = []; anon.on('console', m => m.type() === 'error' && anonErr.push(m.text())); anon.on('pageerror', e => anonErr.push(e.message));
for (const [label, path, expect] of [
  ['Landing', '/', null], ['Discover', '/discover', null], ['Creator profile', '/@admin', '@admin'],
  ['Public seeded collection', '/@admin/kubernetes', 'Kubernetes'],
  ['Public test collection', slug ? `/@admin/${slug}` : null, null],
  ['Unknown handle-less path → 404', '/admin-no-at/x', null], ['Tracks (legacy)', '/tracks', null],
]) {
  if (!path) { check(label, false, 'collection slug unknown'); continue; }
  const r = await anon.goto(BASE + path); await anon.waitForTimeout(1200);
  const txt = await anon.locator('body').innerText();
  check(`Public route ${label} renders (${path})`, r.status() < 400 && txt.length > 50 && (!expect || txt.includes(expect)), txt.slice(0, 80).replace(/\n/g, ' '));
  await anon.screenshot({ path: `${SHOTS}/14-public-${label.replace(/\W+/g, '-')}.png` });
}
// public page view with rich text + table
if (slug) {
  await anon.goto(`${BASE}/@admin/${slug}`); await anon.waitForTimeout(1200);
  const link = anon.locator(`a[href^="/@admin/${slug}/"]`).first();
  if (await link.count()) {
    await link.click(); await anon.waitForTimeout(1500);
    const strong = await anon.locator('strong', { hasText: 'world' }).count();
    const em = await anon.locator('em', { hasText: 'and' }).count();
    const a = await anon.locator('a[href="https://example.com/a_(b)"]').count();
    const th = await anon.locator('th', { hasText: 'H1' }).count();
    const cap = await anon.locator('caption, figcaption', { hasText: 'Caption ✓ <b>' }).count();
    const img = await anon.locator('img').evaluateAll(is => is.filter(i => i.naturalWidth > 0).length);
    check('Public page renders bold/italic/link/table header+caption', strong && em && a && th && cap, `strong=${strong} em=${em} a=${a} th=${th} caption=${cap} images=${img}`);
    await anon.screenshot({ path: SHOTS + '/15-public-page.png', fullPage: true });
  } else check('Public page link present on public collection', false);
}
// creator-only routes when logged out
const r1 = await anon.goto(BASE + '/create'); await anon.waitForTimeout(800);
check('Logged-out /create redirects to login', anon.url().includes('/login'), anon.url());
await anon.goto(BASE + '/create/pages/' + PAGE); await anon.waitForTimeout(800);
check('Logged-out page editor redirects to login', anon.url().includes('/login'), anon.url());
console.log('ERRORS', JSON.stringify(errors)); console.log('ANON_ERRORS', JSON.stringify(anonErr)); console.log('FAILED', JSON.stringify(failed));
await browser.close();
