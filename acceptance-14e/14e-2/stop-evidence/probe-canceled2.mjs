import { chromium } from 'playwright-core';
const b = await chromium.launch({ channel: 'chrome', headless: true });
const A2 = 'http://localhost:8080/@anna_java/java-learning/core-java/the-jvm';
for (let run = 1; run <= 4; run++) {
  const ctx = await b.newContext({ viewport: { width: 1280, height: 900 } });
  const p = await ctx.newPage(); const errs = []; const trail = [];
  p.on('pageerror', (e) => errs.push(`${e.name}: ${e.message} | ${(e.stack || '').split('\n').slice(0, 6).join(' < ').replace(/http:\/\/localhost:8080/g, '')}`));
  await p.goto(A2); await p.getByRole('heading', { level: 1, name: 'The JVM' }).waitFor(); await p.waitForTimeout(800);
  // as in the keyboard pass: Tab to "Next: Collections", Enter, then Tab until "Previous: The JVM", Enter
  const tabTo = async (label) => { for (let i = 0; i < 60; i++) { await p.keyboard.press('Tab'); const a = await p.evaluate(() => `${document.activeElement.tagName}:${document.activeElement.getAttribute('aria-label') || (document.activeElement.textContent || '').trim().slice(0, 25)}`); trail.push(a); if (a.endsWith(label)) return; } };
  await tabTo('Next: Collections'); await p.keyboard.press('Enter'); await p.getByRole('heading', { level: 1, name: 'Collections' }).waitFor(); await p.waitForTimeout(900);
  const m = trail.length; await tabTo('Previous: The JVM');
  const e0 = errs.length; await p.keyboard.press('Enter'); await p.getByRole('heading', { level: 1, name: 'The JVM' }).waitFor(); await p.waitForTimeout(1500);
  console.log(`run ${run}: tab trail on A3 = ${JSON.stringify(trail.slice(m))}; errors before Enter ${e0}, after ${errs.length}: ${errs.join(' || ').slice(0, 600)}`);
  await ctx.close();
}
await b.close();
