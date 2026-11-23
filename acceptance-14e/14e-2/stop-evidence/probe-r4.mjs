import { chromium } from 'playwright-core';
const b = await chromium.launch({ channel: 'chrome', headless: true });
const p = await (await b.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
const A1 = '/@anna_java/java-learning/core-java/hello-java';
await p.goto('http://localhost:8080' + A1); await p.getByRole('heading', { level: 1, name: 'Hello, Java' }).waitFor(); await p.waitForTimeout(1000);
const info = () => p.evaluate(() => ({ y: Math.round(scrollY), docH: document.documentElement.scrollHeight, max: document.documentElement.scrollHeight - innerHeight,
  anchors: [...document.querySelectorAll('[data-scroll-anchor]')].map(e => [e.dataset.scrollAnchor, Math.round(e.getBoundingClientRect().top + scrollY), Math.round(e.getBoundingClientRect().height)]),
  stored: Object.keys(sessionStorage).filter(k => k.startsWith('curio:scroll')).map(k => [k, sessionStorage.getItem(k)]) }));
console.log('initial', JSON.stringify(await info()));
for (const mode of ['instant', 'wheel']) {
  if (mode === 'instant') await p.evaluate(() => window.scrollTo({ top: 1200, behavior: 'instant' }));
  else { await p.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' })); await p.waitForTimeout(300); await p.mouse.move(640, 450); await p.mouse.wheel(0, 1200); }
  await p.waitForTimeout(600);
  console.log(mode, 'before nav', JSON.stringify(await info()));
  await p.getByRole('link', { name: 'Next: The JVM' }).click(); await p.getByRole('heading', { level: 1, name: 'The JVM' }).waitFor(); await p.waitForTimeout(800);
  await p.goBack(); await p.getByRole('heading', { level: 1, name: 'Hello, Java' }).waitFor(); await p.waitForTimeout(1800);
  console.log(mode, 'after back', JSON.stringify(await info()));
}
await b.close();
