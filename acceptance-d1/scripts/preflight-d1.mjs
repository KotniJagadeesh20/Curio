// D1 pre-flight (plan rev. 3 §4 + approved editor-identification clarification). Read-only; run on the UNCHANGED baseline.
// For each target page: (a) is the public Monaco API reachable (global `monaco`, monaco.editor.getEditors,
// monaco.editor.EditorOption.occurrencesHighlight)? (b) how many live editors exist, and how many have
// getContainerDomNode() inside the target block AND model text equal to that block's code? Required: exactly one.
// Targets: P1 public A3 (logged out); P2 creator page editor for A3 (edit mode, then Preview); P3 /problem/:slug.
import { chromium } from 'playwright-core';
import fs from 'fs';
const BASE = 'http://localhost:8080', API = 'http://localhost:8081/api';
const seed = JSON.parse(fs.readFileSync(new URL('./seed14e.json', import.meta.url)));
const results = [];
const check = (n, ok, d = '') => { results.push(!!ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${d ? '  — ' + d : ''}`); };
const info = (s) => console.log(`INFO  ${s}`);
const browser = await chromium.launch({ channel: 'chrome', headless: true });

// Inspect all live editors via the public API; `sel` = CSS selector of the target block, `code` = expected model text.
const inspect = (p, sel, code) => p.evaluate(({ sel, code }) => {
  const m = globalThis.monaco;
  const api = !!(m && m.editor && typeof m.editor.getEditors === 'function' && m.editor.EditorOption && m.editor.EditorOption.occurrencesHighlight !== undefined);
  if (!api) return { api, total: document.querySelectorAll('.monaco-editor').length };
  const block = sel ? document.querySelector(sel) : null;
  const eds = m.editor.getEditors().map((e) => ({
    inBlock: !!block && block.contains(e.getContainerDomNode()),
    textMatch: code == null ? null : e.getModel()?.getValue() === code,
    readOnly: e.getOption(m.editor.EditorOption.readOnly),
    occ: e.getOption(m.editor.EditorOption.occurrencesHighlight),
  }));
  return { api, blockFound: !!block, total: eds.length, eds, matching: eds.filter((e) => e.inBlock && e.textMatch !== false) };
}, { sel, code });

// P1: public A3, logged out. The code block is the <figure> whose caption is "Collections.java".
{
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } }); const p = await ctx.newPage();
  await p.goto(`${BASE}/@${seed.aUser}/java-learning/core-java/collections`);
  await p.locator('.monaco-editor').first().waitFor({ timeout: 15000 }); await p.waitForTimeout(800);
  await p.evaluate(() => { const f = [...document.querySelectorAll('figure')].find((x) => x.textContent.includes('Collections.java') && x.querySelector('.monaco-editor')); if (f) f.setAttribute('data-d1-target', 'public-code'); });
  const r = await inspect(p, '[data-d1-target="public-code"]', seed.code);
  info(`P1 public A3: ${JSON.stringify(r)}`);
  check('[P1] public API available on public A3 (monaco.editor.getEditors + EditorOption.occurrencesHighlight)', r.api);
  check('[P1] exactly one editor inside the A3 code block with model text === seeded code', r.api && r.matching.length === 1, `total editors ${r.total}, matching ${r.matching?.length}`);
  await ctx.close();
}

// P2: creator page editor for A3 (owner, logged in via the app's token key).
{
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await ctx.addInitScript((t) => { try { localStorage.setItem('auth_token', t); } catch {} }, seed.aToken);
  const p = await ctx.newPage();
  await p.goto(`${BASE}/create/pages/${seed.ids.a3}`);
  await p.getByRole('textbox', { name: 'Code', exact: true }).first().waitFor({ timeout: 15000 }); await p.waitForTimeout(1500);
  const edit = await p.evaluate(() => ({ monacoEditors: document.querySelectorAll('.monaco-editor').length, codeTextareas: document.querySelectorAll('textarea[aria-label="Code"]').length }));
  info(`P2 creator editor (edit mode): ${JSON.stringify(edit)}`);
  check('[P2] creator page editor (edit mode) contains a Monaco editor to assert O2 on', edit.monacoEditors > 0, `monaco editors ${edit.monacoEditors}; code is edited in ${edit.codeTextareas} <textarea aria-label="Code">`);
  await p.getByRole('button', { name: 'Preview' }).click();
  await p.locator('[data-testid="preview"] .monaco-editor').first().waitFor({ timeout: 15000 }).catch(() => {}); await p.waitForTimeout(800);
  const r = await inspect(p, '[data-testid="preview"]', seed.code);
  info(`P2 creator Preview: ${JSON.stringify(r)}`);
  await ctx.close();
}

// P3: /problem/:slug, the only non-read-only CodeEditor usage (src/pages/Problem.tsx).
{
  const list = await (await fetch(`${API}/problems`)).json();
  const slug = list[0]?.slug; const prob = slug ? await (await fetch(`${API}/problems/${slug}`)).json() : null;
  const expected = prob ? (prob.starterCode || `// Write your ${prob.language} solution here\n`) : null;
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } }); const p = await ctx.newPage();
  await p.goto(`${BASE}/problem/${slug}`);
  await p.locator('.monaco-editor').first().waitFor({ timeout: 15000 }); await p.waitForTimeout(800);
  await p.evaluate(() => { const e = document.querySelector('.monaco-editor'); const host = e?.parentElement?.parentElement; if (host) host.setAttribute('data-d1-target', 'problem-editor'); });
  const r = await inspect(p, '[data-d1-target="problem-editor"]', expected);
  info(`P3 /problem/${slug} (${list.length} problems): ${JSON.stringify(r)}`);
  check('[P3] exactly one non-read-only editor on /problem/:slug with model text === the problem\'s starter code', r.api && r.matching.length === 1 && r.matching[0].readOnly === false, `total ${r.total}, matching ${r.matching?.length}`);
  await ctx.close();
}
await browser.close();
const pass = results.filter(Boolean).length;
console.log(`\n${pass}/${results.length} checks passed`);
process.exit(pass === results.length ? 0 : 1);
