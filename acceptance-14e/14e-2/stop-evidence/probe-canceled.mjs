import { chromium } from 'playwright-core';
const b = await chromium.launch({ channel: 'chrome', headless: true });
const A3 = 'http://localhost:8080/@anna_java/java-learning/core-java/collections';
for (const [how, delay] of [['click', 300], ['click', 900], ['click', 2500], ['click', 5000], ['keyboard', 900], ['keyboard', 5000]]) {
  const ctx = await b.newContext({ viewport: { width: 1280, height: 900 } });
  const p = await ctx.newPage(); const errs = [];
  p.on('pageerror', (e) => errs.push(`${e.name}: ${e.message} | ${(e.stack || '').split('\n').slice(0, 4).join(' < ').replace(/http:\/\/localhost:8080/g, '')}`));
  p.on('console', (m) => m.type() === 'error' && errs.push('console: ' + m.text().slice(0, 200)));
  await p.goto(A3); await p.getByRole('heading', { level: 1, name: 'Collections' }).waitFor();
  const t = Date.now(); await p.waitForTimeout(delay);
  const monacoReady = await p.locator('.monaco-editor').count();
  if (how === 'click') await p.getByRole('link', { name: 'Previous: The JVM' }).click();
  else { await p.getByRole('link', { name: 'Previous: The JVM' }).focus(); await p.keyboard.press('Enter'); }
  await p.getByRole('heading', { level: 1, name: 'The JVM' }).waitFor(); await p.waitForTimeout(1500);
  console.log(`${how} leave after ${delay} ms (monaco mounted: ${monacoReady}): ${errs.length ? errs.join(' || ') : 'no errors'}`);
  await ctx.close();
}
await b.close();
