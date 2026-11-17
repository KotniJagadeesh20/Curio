// Review item: cached collection content must never be shown after the collection became unavailable.
// Real browser, real backend: open the collection (cached by React Query), leave inside the SPA, make it unavailable
// through the creator API, come back with browser Back (same SPA, cache intact). A MutationObserver installed before the
// return records whether the old title / cover / outline / noindex tag EVER appear, even for one frame.
import { chromium } from 'playwright-core';
const BASE = 'http://localhost:8080', B = 'http://localhost:8081/api', SHOTS = process.argv[2];
const results = []; const check = (n, ok, d = '') => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${d ? '  — ' + d : ''}`); };
const { token } = await (await fetch(B + '/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'admin@codemastery.local', password: 'ChangeMe123!' }) })).json();
const call = async (m, p, b) => { const r = await fetch(B + p, { method: m, headers: { Authorization: 'Bearer ' + token, 'content-type': 'application/json' }, body: b ? JSON.stringify(b) : undefined }); if (!r.ok) throw new Error(`${m} ${p} ${r.status}`); const t = await r.text(); return t ? JSON.parse(t) : null; };
const idOf = async (slug) => (await call('GET', '/collections/mine')).find((c) => c.slug === slug).id;

const browser = await chromium.launch({ channel: 'chrome', headless: true });
async function scenario(label, slug, title, makeUnavailable, restore, { slowRevalidation = 1500 } = {}) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/@admin/${slug}`);
  await page.getByRole('heading', { level: 1, name: title }).waitFor();
  const unlistedTagBefore = await page.evaluate(() => document.head.querySelectorAll('meta[name="robots"][content="noindex"]').length);
  await page.getByRole('main').getByRole('link', { name: 'Discover', exact: true }).click();   // leave inside the SPA: cache intact
  await page.getByTestId('collection-card').first().waitFor();
  await makeUnavailable();
  // slow the revalidation down so a stale render (if any) would be on screen for a long time
  await page.route(`**/api/public/collections/admin/${slug}`, async (r) => { await new Promise((x) => setTimeout(x, slowRevalidation)); await r.continue(); });
  await page.evaluate((title) => {
    window.__seen = { title: false, cover: false, outline: false, noindex: false, loading: false };
    const scan = () => {
      const h1 = [...document.querySelectorAll('h1')].some((h) => h.textContent === title);
      if (h1) window.__seen.title = true;
      if (document.querySelector('[data-testid=collection-cover]')) window.__seen.cover = true;
      if (document.querySelector('[data-testid=collection-outline]')) window.__seen.outline = true;
      if (document.head.querySelector('meta[name="robots"][content="noindex"]')) window.__seen.noindex = true;
      if ([...document.querySelectorAll('[role=status]')].some((s) => s.textContent.includes('Loading collection'))) window.__seen.loading = true;
    };
    new MutationObserver(scan).observe(document, { subtree: true, childList: true, characterData: true, attributes: true });
  }, title);
  await page.goBack();                                   // back to the collection URL, same SPA, cached data present
  await page.getByTestId('not-available').waitFor({ timeout: 10000 });
  const seen = await page.evaluate(() => window.__seen);
  const finalNoindex = await page.evaluate(() => document.head.querySelectorAll('meta[name="robots"][content="noindex"]').length);
  check(`${label}: loading shown while revalidating (cache held back)`, seen.loading, JSON.stringify(seen));
  check(`${label}: stale title/cover/outline NEVER rendered`, !seen.title && !seen.cover && !seen.outline, JSON.stringify(seen));
  check(`${label}: neutral screen + "Not available · AlgoQuest"`, (await page.title()) === 'Not available · AlgoQuest', await page.title());
  check(`${label}: no noindex during or after (tag existed before: ${unlistedTagBefore})`, !seen.noindex && finalNoindex === 0, `seen=${seen.noindex} final=${finalNoindex}`);
  await page.screenshot({ path: `${SHOTS}/05-stale-${slug}.png` });
  await restore();
  // successful revalidation after restore: current content appears normally on return
  await page.goto(`${BASE}/discover`); await page.getByTestId('collection-card').first().waitFor();
  await page.goBack(); await page.getByRole('heading', { level: 1, name: title }).waitFor({ timeout: 10000 });
  check(`${label}: after restoring, revisiting shows the collection again`, true);
  await ctx.close();
}

const porto = await idOf('porto');
await scenario('Published → unpublished (Porto)', 'porto', 'Porto by tram',
  () => call('POST', `/collections/${porto}/unpublish`), () => call('POST', `/collections/${porto}/publish`, { status: 'PUBLISHED' }));
const secret = await idOf('secret-recipe');
await scenario('Unlisted → unpublished (Secret family recipe)', 'secret-recipe', 'Secret family recipe',
  () => call('POST', `/collections/${secret}/unpublish`), () => call('POST', `/collections/${secret}/publish`, { status: 'UNLISTED' }));
// deleted (restorable): delete then restore
await scenario('Published → deleted (Porto)', 'porto', 'Porto by tram',
  () => call('DELETE', `/collections/${porto}`), async () => { await call('POST', `/collections/${porto}/restore`); await call('POST', `/collections/${porto}/publish`, { status: 'PUBLISHED' }); });
console.log(`\nTOTAL ${results.filter(Boolean).length}/${results.length} passed`);
await browser.close();
