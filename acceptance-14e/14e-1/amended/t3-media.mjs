import { setup, login, check, BASE, SHOTS } from './common.mjs';
import { resolveFixture } from './fixture.mjs';
const D = './';
const { browser, page, errors, failed } = await setup();
await login(page);
const { COLL, PAGE } = await resolveFixture(page);
await page.goto(BASE + '/create/pages/' + PAGE);
await page.getByTestId('block-editor').waitFor();
await page.getByRole('button', { name: 'Add block' }).click(); await page.getByRole('menuitem', { name: 'Image', exact: true }).click();
const card = page.locator('[data-block-type=image]').last();
const imgLoaded = (loc) => loc.evaluate(img => img.complete && img.naturalWidth > 0).catch(() => false);
// upload
await card.getByLabel('Image file').setInputFiles(D + 'red.png');
await card.getByAltText('Image preview').waitFor({ timeout: 10000 });
await page.waitForTimeout(500);
check('Upload shows authenticated preview', await imgLoaded(card.getByAltText('Image preview')));
const firstSrc = await card.getByAltText('Image preview').getAttribute('src');
// replace
await card.getByLabel('Image file').setInputFiles(D + 'blue.png');
await page.waitForTimeout(1500);
const secondSrc = await card.getByAltText('Image preview').getAttribute('src');
check('Replace swaps the preview', secondSrc !== firstSrc && await imgLoaded(card.getByAltText('Image preview')), `${firstSrc?.slice(0,30)} -> ${secondSrc?.slice(0,30)}`);
const replaceLabel = await card.getByRole('button', { name: /Replace image/ }).count();
check('Button reads "Replace image" once an image exists', replaceLabel === 1);
// cancel: hold the upload
let release;
await page.route('**/api/media', (route) => { if (route.request().method() !== 'POST') return route.continue(); return new Promise(r => { release = () => route.continue().catch(() => {}).finally(r); setTimeout(() => release(), 8000); }); });
await card.getByLabel('Image file').setInputFiles(D + 'red.png');
await card.getByRole('button', { name: 'Cancel upload' }).waitFor();
check('Link field locked during upload', await card.getByLabel('Image link').isDisabled());
await page.screenshot({ path: SHOTS + '/08-media-uploading.png' });
await card.getByRole('button', { name: 'Cancel upload' }).click();
await page.waitForTimeout(400);
const afterCancelSrc = await card.getByAltText('Image preview').getAttribute('src').catch(() => null);
check('Cancel keeps the previous image', afterCancelSrc === secondSrc, String(afterCancelSrc).slice(0, 30));
check('Link field unlocked after cancel', !(await card.getByLabel('Image link').isDisabled()));
release?.(); await page.unroute('**/api/media');
// retry: one 503
let once = true;
await page.route('**/api/media', (route) => { if (route.request().method() === 'POST' && once) { once = false; return route.fulfill({ status: 503, contentType: 'application/json', body: '{"message":"busy"}' }); } return route.continue(); });
await card.getByLabel('Image file').setInputFiles(D + 'red.png');
await card.getByRole('button', { name: 'Try again' }).waitFor({ timeout: 8000 });
const alertTxt = await card.getByRole('alert').first().innerText();
await page.screenshot({ path: SHOTS + '/09-media-failed.png' });
await card.getByRole('button', { name: 'Try again' }).click();
await page.waitForTimeout(1500);
const retrySrc = await card.getByAltText('Image preview').getAttribute('src');
check('Failed upload offers "Try again" and retry succeeds', retrySrc !== secondSrc && await imgLoaded(card.getByAltText('Image preview')), alertTxt);
await page.unroute('**/api/media');
await card.getByLabel('Image caption').fill('Red square');
// wait for autosave, reload
const t0 = Date.now(); while (Date.now() - t0 < 15000) { if ((await page.getByText(/^Saved$/).count()) > 0) break; await page.waitForTimeout(400); }
await page.reload(); await page.getByTestId('block-editor').waitFor();
const card2 = page.locator('[data-block-type=image]').last();
await card2.getByAltText('Image preview').waitFor({ timeout: 8000 }); await page.waitForTimeout(800);
check('Authenticated preview renders after refresh', await imgLoaded(card2.getByAltText('Image preview')), (await card2.getByAltText('Image preview').getAttribute('src'))?.slice(0, 30));
await page.screenshot({ path: SHOTS + '/10-media-after-refresh.png', fullPage: true });
// raw asset URL without auth should be refused
const assetHref = await page.evaluate(async (PAGE) => { const r = await fetch('/api/pages/' + PAGE, { headers: { Authorization: 'Bearer ' + localStorage.getItem('auth_token') } }); const p = await r.json(); return p.blocks.find(b => b.type === 'image')?.assetId; }, PAGE);
const anon = await page.request.get(`${BASE}/api/media/${assetHref}/content`, { headers: {} }).then(r => r.status()).catch(e => e.message);
check('Unauthenticated draft media is not served', anon === 401 || anon === 403 || anon === 404, `assetId=${assetHref} anon status=${anon}`);
// remove
await card2.getByRole('button', { name: 'Remove image' }).click();
check('Remove clears preview', (await card2.getByAltText('Image preview').count()) === 0);
await page.keyboard.press('Meta+z').catch(() => {});

// ---- collection cover ----
await page.goto(BASE + '/create/collections/' + COLL);
await page.waitForTimeout(800);
const editBtn = page.getByRole('button', { name: /edit details|settings|edit collection/i }).first();
const hasEdit = await editBtn.count();
if (hasEdit) await editBtn.click();
const form = page.locator('form').filter({ has: page.locator('#c-title') }).first();
await form.getByLabel('Cover image file').setInputFiles(D + 'blue.png');
await form.getByAltText('Cover image preview').waitFor({ timeout: 8000 }); await page.waitForTimeout(500);
check('Cover upload shows preview', await imgLoaded(form.getByAltText('Cover image preview')));
await form.getByLabel('Cover image file').setInputFiles(D + 'red.png'); await page.waitForTimeout(1500);
await form.getByRole('button', { name: /save|update/i }).first().click();
await page.waitForTimeout(1200);
await page.reload(); await page.waitForTimeout(1000);
if (hasEdit) await page.getByRole('button', { name: /edit details|settings|edit collection/i }).first().click();
const coverAfter = page.getByAltText('Cover image preview').first();
await coverAfter.waitFor({ timeout: 8000 }).catch(() => {});
check('Replaced cover persists and renders after refresh', await imgLoaded(coverAfter));
await page.screenshot({ path: SHOTS + '/11-cover-after-refresh.png', fullPage: true });
// pasting a link clears the uploaded cover
await page.getByLabel('Cover image link').fill('https://example.com/c.png');
check('Typing a cover link removes the uploaded cover', (await page.getByAltText('Cover image preview').count()) === 0);
console.log('ERRORS', JSON.stringify(errors)); console.log('FAILED', JSON.stringify(failed));
await browser.close();
