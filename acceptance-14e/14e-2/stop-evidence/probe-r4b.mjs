import { chromium } from 'playwright-core';
const b = await chromium.launch({ channel: 'chrome', headless: true });
const ctx = await b.newContext({ viewport: { width: 1280, height: 900 } });
await ctx.addInitScript(() => {
  window.__log = []; const t0 = () => Math.round(performance.now());
  const wrap = (obj, name) => { const o = obj[name]; obj[name] = function (...a) { window.__log.push([t0(), name, JSON.stringify(a[0]), (new Error().stack || '').split('\n').slice(2, 5).map(s => s.trim().replace(/http:\/\/localhost:8080/g, '')).join(' < ')]); return o.apply(this, a); }; };
  wrap(Element.prototype, 'scrollTo'); wrap(window, 'scrollTo'); wrap(Element.prototype, 'scrollIntoView'); wrap(HTMLElement.prototype, 'focus');
  addEventListener('scroll', () => window.__log.push([t0(), 'scroll-event', Math.round(scrollY)]), true);
});
const p = await ctx.newPage();
await p.goto('http://localhost:8080/@anna_java/java-learning/core-java/hello-java'); await p.getByRole('heading', { level: 1, name: 'Hello, Java' }).waitFor(); await p.waitForTimeout(1000);
await p.evaluate(() => window.scrollTo({ top: 1200, behavior: 'instant' })); await p.waitForTimeout(600);
await p.getByRole('link', { name: 'Next: The JVM' }).click(); await p.getByRole('heading', { level: 1, name: 'The JVM' }).waitFor(); await p.waitForTimeout(800);
const m = await p.evaluate(() => window.__log.length);
await p.goBack(); await p.waitForTimeout(2000);
const log = await p.evaluate((m) => window.__log.slice(m), m);
for (const l of log) console.log(JSON.stringify(l).slice(0, 400));
await b.close();
