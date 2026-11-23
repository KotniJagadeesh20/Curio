// D1 rev. 3 option/regression checks outside the public reader (revised mapping approved 2026-11-23).
// Editor selection everywhere: monaco.editor.getEditors() filtered by getContainerDomNode() inside the target container
// AND model text === the expected code; exactly one match is required (otherwise the check fails).
// O2: /problem/two-sum (the only editable CodeEditor, src/pages/Problem.tsx): readOnly false, occurrencesHighlight equals the
//     FORMAL-BASELINE value. Baseline run: O2_BASELINE unset → the value is recorded to o2-baseline.json (the check then asserts
//     unique identification + readOnly false and prints the recorded value). Post-implementation run: O2_BASELINE=<recorded value>.
// O3: /problem/two-sum: typing into the editor changes its model (text appended at the end of the document).
// O4: creator page editor for A3 → Preview: the preview's code editor (unique match) is read-only with occurrencesHighlight "off".
//     (Creator edit mode has no Monaco: code is a <textarea aria-label="Code">; that path is covered by 13e t2-editor.)
import { chromium } from 'playwright-core';
import fs from 'fs';
const BASE = 'http://localhost:8080', API = 'http://localhost:8081/api', SLUG = 'two-sum';
const seed = JSON.parse(fs.readFileSync(new URL('./seed14e.json', import.meta.url)));
const results = [];
const check = (n, ok, d = '') => { results.push(!!ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${d ? '  — ' + d : ''}`); };
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const errsOf = (p) => { const e = []; p.on('pageerror', (x) => e.push('pageerror: ' + x.message)); p.on('console', (m) => { if (m.type() === 'error' && !/status of 404/.test(m.text())) e.push(m.text()); }); return e; };
const pick = (p, sel, code) => p.evaluate(({ sel, code }) => {
  const m = globalThis.monaco;
  if (!(m?.editor?.getEditors && m.editor.EditorOption?.occurrencesHighlight !== undefined)) return { api: false };
  const box = document.querySelector(sel); const all = m.editor.getEditors();
  const hits = all.filter((e) => box && box.contains(e.getContainerDomNode()) && e.getModel()?.getValue() === code);
  return { api: true, total: all.length, matches: hits.length, readOnly: hits[0]?.getOption(m.editor.EditorOption.readOnly), occ: hits[0]?.getOption(m.editor.EditorOption.occurrencesHighlight) };
}, { sel, code });

// O2 + O3: practice-problem editor.
{
  const prob = await (await fetch(`${API}/problems/${SLUG}`)).json();
  const starter = prob.starterCode || `// Write your ${prob.language} solution here\n`;
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } }); const p = await ctx.newPage(); const errs = errsOf(p);
  await p.goto(`${BASE}/problem/${SLUG}`); await p.locator('.monaco-editor').first().waitFor({ timeout: 15000 }); await p.waitForTimeout(800);
  const r = await pick(p, 'main, #root', starter);
  console.log('      O2 read-back: ' + JSON.stringify(r));
  const base = process.env.O2_BASELINE;
  if (base === undefined) {
    fs.writeFileSync(new URL('./o2-baseline.json', import.meta.url), JSON.stringify({ slug: SLUG, occurrencesHighlight: r.occ, readOnly: r.readOnly }, null, 2));
    check(`[O2 problem option] /problem/${SLUG} editor (unique match) is editable; BASELINE value recorded: ${JSON.stringify(r.occ)}`, r.api && r.matches === 1 && r.readOnly === false && r.occ !== undefined, `editors ${r.total}, matches ${r.matches}`);
  } else {
    check(`[O2 problem option] /problem/${SLUG} editor (unique match) is editable and occurrencesHighlight equals the formal baseline ${JSON.stringify(base)}`, r.api && r.matches === 1 && r.readOnly === false && r.occ === base, `editors ${r.total}, matches ${r.matches}, now ${JSON.stringify(r.occ)}`);
  }
  // O3: type at the end of the document.
  const marker = '// d1-o3-typed';
  await p.locator('.monaco-editor').first().click(); await p.keyboard.press('Meta+ArrowDown'); await p.keyboard.press('End');
  await p.keyboard.press('Enter'); await p.keyboard.type(marker); await p.waitForTimeout(300);
  const after = await p.evaluate(() => globalThis.monaco.editor.getEditors().map((e) => e.getModel()?.getValue()));
  check(`[O3 problem editing] typing into the /problem/${SLUG} editor changes its model`, after.length === 1 && after[0] !== starter && after[0].includes(marker), `model ends with ${JSON.stringify((after[0] || '').slice(-40))}`);
  check(`[O2/O3] no uncaught error or console error on /problem/${SLUG}`, errs.length === 0, errs.slice(0, 2).join(' | '));
  await ctx.close();
}

// O4: creator Preview.
{
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await ctx.addInitScript((t) => { try { localStorage.setItem('auth_token', t); } catch {} }, seed.aToken);
  const p = await ctx.newPage(); const errs = errsOf(p);
  await p.goto(`${BASE}/create/pages/${seed.ids.a3}`);
  await p.getByRole('textbox', { name: 'Code', exact: true }).first().waitFor({ timeout: 15000 }); await p.waitForTimeout(800);
  await p.getByRole('button', { name: 'Preview' }).click();
  await p.locator('[data-testid="preview"] .monaco-editor').first().waitFor({ timeout: 15000 }); await p.waitForTimeout(800);
  const r = await pick(p, '[data-testid="preview"]', seed.code);
  console.log('      O4 read-back: ' + JSON.stringify(r));
  check('[O4 creator Preview option] preview code editor (unique match) is read-only with occurrencesHighlight === "off"', r.api && r.matches === 1 && r.readOnly === true && r.occ === 'off', `editors ${r.total}, matches ${r.matches}, readOnly ${r.readOnly}, occurrencesHighlight ${JSON.stringify(r.occ)}`);
  check('[O4] no uncaught error or console error on the creator page editor / Preview', errs.length === 0, errs.slice(0, 2).join(' | '));
  await ctx.close();
}
await browser.close();
const pass = results.filter(Boolean).length;
console.log(`\n${pass}/${results.length} checks passed`);
process.exit(pass === results.length ? 0 : 1);
