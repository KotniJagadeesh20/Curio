import { setup, login, check, BASE, SHOTS } from './common.mjs';
const { browser, page, errors, failed } = await setup();
await login(page);
// new blank collection + module + page through the UI
await page.goto(BASE + '/create');
await page.getByRole('button', { name: 'New collection' }).click();
const title = `Editor accept ${Date.now() % 100000}`;
await page.fill('#c-title', title);
await page.getByRole('dialog').getByRole('button', { name: 'Create collection' }).click();
await page.waitForURL(/\/create\/collections\/\d+/);
const collUrl = page.url();
await page.getByRole('button', { name: 'Add module' }).click();
await page.getByRole('dialog').locator('input').first().fill('Module A');
await page.getByRole('dialog').getByRole('button').filter({ hasText: /save|create|add/i }).first().click();
await page.waitForTimeout(600);
await page.getByRole('button', { name: /add page/i }).first().click();
await page.getByRole('dialog').locator('input').first().fill('Page One');
await page.getByRole('dialog').getByRole('button').filter({ hasText: /save|create|add/i }).first().click();
await page.waitForTimeout(600);
await page.locator('a[href^="/create/pages/"]').first().click();
await page.waitForURL(/\/create\/pages\/\d+/);
const pageUrl = page.url();
const status = () => page.getByText(/^(Saved|Saving\.\.\.|Unsaved changes.*)$/).first().innerText().catch(() => '?');
const addBlock = async (label) => { await page.getByRole('button', { name: 'Add block' }).click(); await page.getByRole('menuitem', { name: label, exact: true }).click(); };

// ---- rich text ----
await addBlock('Text');
const ta = page.getByRole('textbox', { name: 'Text', exact: true }).last();
await ta.click();
await page.keyboard.type('Hello world and more');
await page.keyboard.press('Shift+Home'); // select line
// select "world": set selection programmatically like a mouse drag
const sel = async (s, e) => ta.evaluate((el, [s, e]) => el.setSelectionRange(s, e), [s, e]);
await sel(6, 11); await page.keyboard.press('Meta+b'); await page.waitForTimeout(100);
let v = await ta.inputValue();
const selAfterBold = await ta.evaluate(el => el.value.slice(el.selectionStart, el.selectionEnd));
check('Bold (Cmd+B) wraps selection', v === 'Hello **world** and more', v);
check('Selection kept on the formatted text after bold', selAfterBold.includes('world'), JSON.stringify(selAfterBold));
await sel(v.indexOf('and'), v.indexOf('and') + 3);
await page.getByRole('button', { name: 'Italic' }).click(); await page.waitForTimeout(100);
v = await ta.inputValue();
check('Italic toolbar button keeps textarea selection and wraps', /_and_|\*and\*/.test(v), v);
// combined: bold then italic same word
await sel(v.indexOf('more'), v.indexOf('more') + 4);
await page.keyboard.press('Meta+b'); await page.waitForTimeout(80);
await page.keyboard.press('Meta+i'); await page.waitForTimeout(80);
v = await ta.inputValue();
check('Combined bold+italic', /more/.test(v) && v.length > 'Hello **world** _and_ more'.length + 4, v);
// link
await page.keyboard.press('Meta+ArrowDown');
await page.keyboard.type(' ');
await page.keyboard.press('Meta+k'); await page.waitForTimeout(80);
const linkSel = await ta.evaluate(el => el.value.slice(el.selectionStart, el.selectionEnd));
check('Link with no selection inserts [link text](https://) with the address selected', linkSel === 'https://', JSON.stringify(linkSel));
await page.keyboard.type('https://example.com/a_(b)');
v = await ta.inputValue();
check('Typing replaces placeholder (caret correct)', v.endsWith('[link text](https://example.com/a_(b))'), v);
// caret placement after empty bold
await page.keyboard.press('Meta+ArrowDown'); await page.keyboard.press('Enter'); await page.keyboard.press('Enter');
await page.keyboard.press('Meta+b'); await page.waitForTimeout(80);
const placeholderSel = await ta.evaluate(el => el.value.slice(el.selectionStart, el.selectionEnd));
check('Empty bold selects placeholder', placeholderSel === 'bold text', placeholderSel);
await page.keyboard.type('Strong');
// special chars + multiline selection
await page.keyboard.press('Meta+ArrowDown'); await page.keyboard.press('Enter');
await page.keyboard.type('Specials: * _ [ ] < > & " \' ` ~ é 中文 😀');
await page.keyboard.press('Enter');
await page.keyboard.type('line two');
v = await ta.inputValue();
const s1 = v.indexOf('Specials'); const e1 = v.length;
await sel(s1, e1);
await page.keyboard.press('Meta+b'); await page.waitForTimeout(100);
const v2 = await ta.inputValue();
check('Multiline + special-char selection bolded with escaping', v2 !== v && /\\\*|\\_|\\\[/.test(v2), JSON.stringify(v2.slice(v2.indexOf('Specials') - 3)));
await page.screenshot({ path: SHOTS + '/05-richtext.png', fullPage: true });
const problemTxt = await page.getByTestId('block-problem').allInnerTexts();
check('No rich-text validation problem shown', problemTxt.length === 0, problemTxt.join('|'));
const richSource = await ta.inputValue();

// ---- table ----
await addBlock('Table');
const tbl = page.getByTestId('table-editor').last();
const cellsBefore = await tbl.locator('tbody input').count();
await tbl.getByRole('button', { name: 'Add row' }).click();
await tbl.getByRole('button', { name: 'Add column' }).click();
await tbl.getByRole('button', { name: 'Add column' }).click();
const rows = await tbl.locator('tbody tr').count(); const cols = await tbl.locator('tbody tr').first().locator('input').count();
check('Add row/column', rows >= 2 && cols >= 3, `before cells=${cellsBefore}, now ${rows}x${cols}`);
for (let i = 0; i < rows; i++) for (let j = 0; j < cols; j++) await tbl.getByLabel(new RegExp(`^Row ${i + 1}, column ${j + 1}`)).fill(i === 0 ? `H${j + 1}` : `r${i + 1}c${j + 1}`);
check('New table defaults to header on', (await tbl.getByRole('switch').getAttribute('aria-checked')) === 'true');
await tbl.getByRole('switch').click(); await tbl.getByRole('switch').click();
const hdr = await tbl.getByLabel(/^Row 1, column 1 \(header\)/).count();
check('Header toggle marks row 1 as header', hdr === 1);
await tbl.getByLabel('Table caption').fill('Caption ✓ <b>');
await tbl.getByRole('button', { name: `Remove column ${cols}` }).click();
await tbl.getByRole('button', { name: 'Add row' }).click();
await tbl.getByLabel(/^Row 3, column 1/).fill('temp');
await tbl.getByRole('button', { name: 'Remove row 3' }).click();
const rows2 = await tbl.locator('tbody tr').count(); const cols2 = await tbl.locator('tbody tr').first().locator('input').count();
check('Remove row/column', rows2 === rows && cols2 === cols - 1, `${rows2}x${cols2}`);
// ---- callout + heading for ordering ----
await addBlock('Heading');
await page.getByLabel('Heading text').last().fill('Moved heading');
await page.getByRole('button', { name: /Move block \d+ \(Heading\) up/ }).last().click();
await page.getByRole('button', { name: /Move block \d+ \(Heading\) up/ }).last().click();
const order = await page.locator('[data-testid^=block-][data-block-type]').evaluateAll(els => els.map(e => e.dataset.blockType));
check('Heading moved above text and table', order.indexOf('heading') < order.indexOf('text'), order.join(','));
// ---- autosave ----
let st = await status();
const t0 = Date.now(); while (!/^Saved$/.test(st) && Date.now() - t0 < 15000) { await page.waitForTimeout(500); st = await status(); }
check('Autosave reaches "Saved"', st === 'Saved', `${st} after ${Date.now() - t0}ms`);
await page.screenshot({ path: SHOTS + '/06-editor-saved.png', fullPage: true });
await page.reload(); await page.getByTestId('block-editor').waitFor(); await page.waitForTimeout(500);
const order2 = await page.locator('[data-testid^=block-][data-block-type]').evaluateAll(els => els.map(e => e.dataset.blockType));
check('Block order persists after refresh', JSON.stringify(order2) === JSON.stringify(order), order2.join(','));
const ta2 = page.getByRole('textbox', { name: 'Text', exact: true }).last();
const reloadedSrc = await ta2.inputValue();
// The source is re-serialized from the stored doc (documented 13c rules): a single line break inside a paragraph becomes a space, and
// parentheses in a link address are escaped in the source (the stored href is unchanged). Assert that exact canonical form.
const canonicalSource = 'Hello **world** _and_ **_more_** [link text](https://example.com/a_\\(b\\))\n\n**Strong** **Specials: \\* \\_ \\[ \\] < > & " \' ` ~ é 中文 😀** **line two**';
check('Rich text (formatting + specials) persists after refresh (canonical form)', reloadedSrc === canonicalSource, reloadedSrc === canonicalSource ? '' : `\nexpected=${JSON.stringify(canonicalSource)}\nactual  =${JSON.stringify(reloadedSrc)}`);
const storedDoc = await page.evaluate(async (id) => { const r = await fetch('/api/pages/' + id, { headers: { Authorization: 'Bearer ' + localStorage.getItem('auth_token') } }); return (await r.json()).blocks.find(b => b.type === 'text').doc; }, pageUrl.split('/').pop());
const runs = storedDoc.flatMap(n => n.children);
check('Stored doc keeps bold/italic runs and exact href', runs.some(r => r.text === 'world' && r.bold) && runs.some(r => r.text === 'and' && r.italic) && runs.some(r => r.text === 'more' && r.bold && r.italic) && runs.some(r => r.href === 'https://example.com/a_(b)') && runs.some(r => r.bold && r.text.includes('中文 😀')), JSON.stringify(runs).slice(0, 160));
const tbl2 = page.getByTestId('table-editor').last();
const cellVals = await tbl2.locator('tbody input').evaluateAll(els => els.map(e => e.value));
// After: fill 3x4, remove column 4, add row 4, overwrite row 3 col 1 with 'temp', remove row 3 -> the original rows 1-2 plus the new, empty row.
const expectedCells = [['H1', 'H2', 'H3'], ['r2c1', 'r2c2', 'r2c3'], ['', '', '']];
const cellGrid = await tbl2.locator('tbody tr').evaluateAll(trs => trs.map(tr => [...tr.querySelectorAll('input')].map(i => i.value)));
check('Table cells persist (exact values, including empty cells)', JSON.stringify(cellGrid) === JSON.stringify(expectedCells), JSON.stringify(cellGrid));
check('Table header + caption persist', (await tbl2.getByRole('switch').getAttribute('aria-checked')) === 'true' && (await tbl2.getByLabel('Table caption').inputValue()) === 'Caption ✓ <b>');
check('Status "Saved" after reload (no spurious dirty)', (await status()) === 'Saved', await status());
// ---- narrow screen table scroll ----
await page.setViewportSize({ width: 360, height: 780 });
await page.waitForTimeout(300);
const scroll = await page.getByTestId('table-editor-scroll').last().evaluate(el => ({ sw: el.scrollWidth, cw: el.clientWidth, doc: document.documentElement.scrollWidth, vw: window.innerWidth }));
check('Narrow screen: table scrolls inside its container', scroll.sw > scroll.cw, JSON.stringify(scroll));
check('Narrow screen: page itself has no horizontal overflow', scroll.doc <= scroll.vw + 1, JSON.stringify(scroll));
await page.getByTestId('table-editor-scroll').last().scrollIntoViewIfNeeded();
await page.screenshot({ path: SHOTS + '/07-table-narrow.png' });
await page.setViewportSize({ width: 1280, height: 900 });
console.log('PAGEURL', pageUrl, 'COLL', collUrl);
console.log('ERRORS', JSON.stringify(errors)); console.log('FAILED', JSON.stringify(failed));
await browser.close();
