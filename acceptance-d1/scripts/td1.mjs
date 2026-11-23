// D1 regression test (proposed: acceptance-d1/scripts/td1.mjs). Public reading, logged out, seeded by seed14e.mjs.
// T1 (the D1 path): open A2, Tab to "Next: Collections" + Enter (in-app arrival on A3); then on A3, Tab until focus is inside the code block's editor, Tab out, then Enter on
//    "Previous: The JVM". Required: the JVM page opens AND no uncaught error / unhandled rejection at any point.
// T3 (control): A3 loaded directly (full page load), same keyboard sequence — recorded to locate the trigger.
// T4 (control): T1 with a 400 ms dwell in the editor and on Previous.
// T1 presses keys back to back (no dwell), like a fast keyboard user and the 14e-2 keyboard pass.
// T2 (control): in-app arrival, mouse click into the editor, click "Previous" → must pass on both old and new code.
// rev. 3 additions (disclosed; the 10 checks above are unchanged):
// T5 (fast mouse, zero dwell) ×4: in-app arrival on A3, click in the editor, IMMEDIATELY click "Previous: The JVM". Same assertion as T1.
// O1: on A3 (logged out), the code block's editor — identified by getContainerDomNode() inside the <figure> captioned
//     "Collections.java" AND model text === seeded code, exactly one match — has occurrencesHighlight === "off".
// Each timeline event is logged with a timestamp so the moment of the rejection is recorded.
import { chromium } from 'playwright-core';
import fs from 'fs';
const BASE = 'http://localhost:8080';
const seed = JSON.parse(fs.readFileSync(new URL('./seed14e.json', import.meta.url)));
const A2 = `/@${seed.aUser}/java-learning/core-java/the-jvm`;
const A3 = `/@${seed.aUser}/java-learning/core-java/collections`;
const N = Number(process.env.N ?? 4);
const results = [];
const check = (n, ok, d = '') => { results.push(!!ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${d ? '  — ' + d : ''}`); };
const browser = await chromium.launch({ channel: 'chrome', headless: true });
async function run(label, path, dwell = 0) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const p = await ctx.newPage(); const t0 = Date.now(); const tl = []; const ev = (s) => tl.push(`${Date.now() - t0}ms ${s}`);
  const errs = [];
  p.on('pageerror', (e) => { errs.push(e.message); ev(`PAGEERROR ${e.message}`); });
  p.on('console', (m) => { if (m.type() === 'error' && !/status of 404/.test(m.text())) { errs.push(m.text()); ev(`CONSOLE.ERROR ${m.text().slice(0, 80)}`); } });
  if (path === 'direct') { await p.goto(BASE + A3); }
  else {
    await p.goto(BASE + A2); await p.getByRole('heading', { level: 1, name: 'The JVM' }).waitFor(); await p.waitForTimeout(800);
    if (path === 'keyboard') { for (let i = 0; i < 60; i++) { await p.keyboard.press('Tab'); if (await p.evaluate(() => document.activeElement?.getAttribute('aria-label') === 'Next: Collections')) break; } await p.keyboard.press('Enter'); }
    else await p.getByRole('link', { name: 'Next: Collections' }).click();
    ev('in-app navigation A2 → A3');
  }
  await p.getByRole('heading', { level: 1, name: 'Collections' }).waitFor();
  await p.locator('.monaco-editor').first().waitFor({ timeout: 15000 }); await p.waitForTimeout(800); ev('A3 ready, editor mounted');
  if (path !== 'mouse') {
    let inEditor = false;
    for (let i = 0; i < 40 && !inEditor; i++) { await p.keyboard.press('Tab'); inEditor = await p.evaluate(() => !!document.activeElement?.closest('.monaco-editor')); }
    ev(`focus inside editor: ${inEditor}`); if (dwell) await p.waitForTimeout(dwell);
    let onPrev = false;
    for (let i = 0; i < 10 && !onPrev; i++) { await p.keyboard.press('Tab'); onPrev = await p.evaluate(() => document.activeElement?.getAttribute('aria-label') === 'Previous: The JVM'); }
    ev(`focus on "Previous: The JVM": ${onPrev}`); if (dwell) await p.waitForTimeout(dwell);
    await p.keyboard.press('Enter'); ev('Enter pressed (navigation → editor unmount)');
  } else if (path === 'mouse-fast') {
    await p.locator('.monaco-editor').first().click(); ev('mouse click in editor');
    await p.getByRole('link', { name: 'Previous: The JVM' }).click(); ev('clicked Previous (no pause)');
  } else {
    await p.locator('.monaco-editor').first().click(); ev('mouse click in editor'); await p.waitForTimeout(400);
    await p.getByRole('link', { name: 'Previous: The JVM' }).click(); ev('clicked Previous');
  }
  const ok = await p.getByRole('heading', { level: 1, name: 'The JVM' }).waitFor({ timeout: 10000 }).then(() => true, () => false);
  ev(`The JVM shown: ${ok}`); await p.waitForTimeout(1500); ev('settled');
  check(`${label}: reaches "The JVM" with no uncaught error or unhandled rejection`, ok && errs.length === 0, errs.slice(0, 2).join(' | '));
  console.log('      timeline: ' + tl.join(' → '));
  await ctx.close();
}
for (let i = 1; i <= N; i++) await run(`[T1 keyboard #${i}] Tab through code editor, Enter on Previous`, 'keyboard');
for (let i = 1; i <= 2; i++) await run(`[T3 direct-load #${i}] Tab through code editor, Enter on Previous`, 'direct');
for (let i = 1; i <= 2; i++) await run(`[T4 dwell control #${i}] same as T1 but 400 ms pause in the editor and on Previous`, 'keyboard', 400);
for (let i = 1; i <= 2; i++) await run(`[T2 mouse control #${i}] click in editor, click Previous`, 'mouse');
for (let i = 1; i <= 4; i++) await run(`[T5 fast mouse #${i}] click in editor, IMMEDIATELY click Previous`, 'mouse-fast');
{ // O1
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } }); const p = await ctx.newPage();
  await p.goto(BASE + A3); await p.locator('.monaco-editor').first().waitFor({ timeout: 15000 }); await p.waitForTimeout(800);
  const r = await p.evaluate((code) => {
    const m = globalThis.monaco;
    if (!(m?.editor?.getEditors && m.editor.EditorOption?.occurrencesHighlight !== undefined)) return { api: false };
    const fig = [...document.querySelectorAll('figure')].find((f) => f.textContent.includes('Collections.java') && f.querySelector('.monaco-editor'));
    const all = m.editor.getEditors();
    const hits = all.filter((e) => fig && fig.contains(e.getContainerDomNode()) && e.getModel()?.getValue() === code);
    return { api: true, total: all.length, matches: hits.length, readOnly: hits[0]?.getOption(m.editor.EditorOption.readOnly), occ: hits[0]?.getOption(m.editor.EditorOption.occurrencesHighlight) };
  }, seed.code);
  console.log('      O1 read-back: ' + JSON.stringify(r));
  check('[O1 public option] A3 code-block editor (unique match) is read-only with occurrencesHighlight === "off"', r.api && r.matches === 1 && r.readOnly === true && r.occ === 'off', `api ${r.api}, editors ${r.total}, matches ${r.matches}, readOnly ${r.readOnly}, occurrencesHighlight ${JSON.stringify(r.occ)}`);
  await ctx.close();
}
await browser.close();
const pass = results.filter(Boolean).length;
console.log(`\n${pass}/${results.length} checks passed`);
process.exit(pass === results.length ? 0 : 1);
