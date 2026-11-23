import { chromium } from 'playwright-core';
const b = await chromium.launch({ channel: 'chrome', headless: true });
const A3 = 'http://localhost:8080/@anna_java/java-learning/core-java/collections';
for (const how of ['mouse click into the code, then click Previous', 'mouse click into the code, then sidebar link', 'no editor focus, Tab past nothing, click Previous']) {
  const ctx = await b.newContext({ viewport: { width: 1280, height: 900 } });
  const p = await ctx.newPage(); const errs = [];
  p.on('pageerror', (e) => errs.push(`${e.message}`));
  await p.goto(A3); await p.getByRole('heading', { level: 1, name: 'Collections' }).waitFor(); await p.locator('.monaco-editor .view-lines').first().waitFor(); await p.waitForTimeout(800);
  if (how.startsWith('mouse')) await p.locator('.monaco-editor .view-lines').first().click();
  await p.waitForTimeout(300);
  const focused = await p.evaluate(() => `${document.activeElement.tagName}:${document.activeElement.getAttribute('aria-label') || ''}`);
  if (how.includes('sidebar')) await p.getByTestId('page-sidebar').getByRole('link', { name: 'The JVM' }).click();
  else await p.getByRole('link', { name: 'Previous: The JVM' }).click();
  await p.getByRole('heading', { level: 1, name: 'The JVM' }).waitFor(); await p.waitForTimeout(1500);
  console.log(`${how} (focused before leaving: ${focused}): ${errs.length ? errs.join(' | ') : 'no errors'}`);
  await ctx.close();
}
await b.close();
