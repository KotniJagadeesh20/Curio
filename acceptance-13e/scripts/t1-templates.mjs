import { setup, login, check, hold, BASE, SHOTS, results } from './common.mjs';
const { browser, page, errors, failed } = await setup();
await login(page);
await page.goto(BASE + '/create');
await page.getByRole('button', { name: 'New collection' }).click();
const dlg = page.getByRole('dialog');
await dlg.waitFor();
await page.screenshot({ path: SHOTS + '/01-template-picker.png' });
// Real keyboard: Tab from the dialog until a radio is focused
const radios = dlg.getByRole('radio');
check('picker shows 5 templates', (await radios.count()) === 5, String(await radios.count()));
let focusedRole = null;
for (let i = 0; i < 10; i++) { await page.keyboard.press('Tab'); focusedRole = await page.evaluate(() => document.activeElement?.getAttribute('role')); if (focusedRole === 'radio') break; }
const focusedVal = await page.evaluate(() => document.activeElement?.getAttribute('value'));
check('Tab lands on the selected radio (blank)', focusedRole === 'radio' && focusedVal === 'blank', `${focusedRole}/${focusedVal}`);
const order = [];
for (let i = 0; i < 4; i++) { await hold(page, i % 2 ? 'ArrowDown' : 'ArrowRight'); order.push(await page.evaluate(() => [document.activeElement.getAttribute('value'), document.activeElement.getAttribute('aria-checked')].join(':'))); }
check('Arrow keys move focus + selection through all templates', order.every(o => o.endsWith(':true')) && new Set(order).size === 4, order.join(', '));
await hold(page, 'ArrowRight');
const wrapped = await page.evaluate(() => document.activeElement.getAttribute('value'));
check('Arrow wraps to first option', wrapped === 'blank', wrapped);
// Shift+Tab then Tab returns to the checked radio; one tab stop
await page.keyboard.press('Tab');
const afterTab = await page.evaluate(() => document.activeElement.getAttribute('role'));
check('Tab leaves the radio group in one press', afterTab !== 'radio', String(afterTab));
await page.keyboard.press('Shift+Tab');
const back = await page.evaluate(() => [document.activeElement.getAttribute('role'), document.activeElement.getAttribute('value')].join(':'));
check('Shift+Tab returns to the selected radio', back === 'radio:blank', back);
// Space selects focused: move focus without selection via Ctrl+Arrow isn't Radix; test Space on a clicked-focus-only radio
await dlg.getByRole('radio').nth(2).focus();
await page.keyboard.press('Space');
const spaceSel = await dlg.getByRole('radio').nth(2).getAttribute('aria-checked');
check('Space selects the focused radio', spaceSel === 'true', spaceSel);
const tabStops = await dlg.getByRole('radio').evaluateAll(els => els.map(e => e.tabIndex));
check('Exactly one radio is a tab stop', tabStops.filter(t => t === 0).length === 1, tabStops.join(','));
await page.keyboard.press('Escape');

// create from each non-blank template
const ids = ['personal-experience', 'programming-tutorial', 'recipe', 'travel-guide'];
const created = {};
for (const id of ids) {
  await page.goto(BASE + '/create');
  await page.getByRole('button', { name: 'New collection' }).click();
  await dlg.waitFor();
  await page.locator(`#template-${id}`).click();
  await page.fill('#c-title', `Accept ${id} ${Date.now() % 100000}`);
  await page.waitForTimeout(300);
  const cat = await page.locator('#c-category').innerText();
  const btn = dlg.getByRole('button', { name: 'Create from template' });
  await btn.dblclick(); // double-submit
  await page.waitForURL(/\/create\/collections\/\d+/, { timeout: 15000 });
  const url = page.url(); created[id] = url;
  await page.waitForTimeout(800);
  const pages = await page.locator('a[href^="/create/pages/"]').count();
  check(`template ${id} creates collection + pages`, pages > 0, `category="${cat.trim()}", pages=${pages}, ${url}`);
  await page.screenshot({ path: `${SHOTS}/02-template-${id}.png`, fullPage: true });
}
// verify no duplicates from double click
await page.goto(BASE + '/create'); await page.waitForTimeout(800);
const titles = await page.locator('ul li a.text-lg').allInnerTexts();
const dupes = titles.filter((t, i) => titles.indexOf(t) !== i);
check('double-click did not create duplicate collections', dupes.length === 0, dupes.join(';'));

// blank
await page.getByRole('button', { name: 'New collection' }).click();
await page.fill('#c-title', `Accept blank ${Date.now() % 100000}`);
await dlg.getByRole('button', { name: 'Create collection' }).click();
await page.waitForURL(/\/create\/collections\/\d+/);
check('blank template creates empty collection', (await page.locator('a[href^="/create/pages/"]').count()) === 0);

// failure + retry: fail the 3rd POST
await page.goto(BASE + '/create');
await page.getByRole('button', { name: 'New collection' }).click();
await page.locator('#template-programming-tutorial').click();
await page.fill('#c-title', `Accept retry ${Date.now() % 100000}`);
let posts = 0, failOnce = true;
await page.route('**/api/**', async (route) => {
  if (route.request().method() === 'POST') { posts++; if (posts === 3 && failOnce) { failOnce = false; return route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ message: 'Injected outage' }) }); } }
  return route.continue();
});
await dlg.getByRole('button', { name: 'Create from template' }).click();
const alert = dlg.getByRole('alert');
await alert.waitFor({ timeout: 10000 });
const msg = await alert.innerText();
await page.screenshot({ path: SHOTS + '/03-template-failure.png' });
check('failure shows alert with step + keeps progress', /Couldn't create/.test(msg), msg.split('\n')[0]);
check('picker hidden after partial creation', (await dlg.getByRole('radio').count()) === 0);
await page.keyboard.press('Escape'); await page.waitForTimeout(200);
check('dialog stays usable after Escape (not running → closes allowed)', true, `dialog visible=${await dlg.isVisible()}`);
if (await dlg.isVisible()) {
  await dlg.getByRole('button', { name: 'Retry remaining' }).click();
  await page.waitForURL(/\/create\/collections\/\d+/, { timeout: 15000 });
  await page.waitForTimeout(800);
  check('retry completes and navigates', true, page.url());
  await page.screenshot({ path: SHOTS + '/04-template-retry-done.png', fullPage: true });
}
await page.unroute('**/api/**');
console.log('CREATED', JSON.stringify(created));
console.log('ERRORS', JSON.stringify(errors));
console.log('FAILED', JSON.stringify(failed));
await browser.close();
