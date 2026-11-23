import { chromium } from 'playwright-core';
const b = await chromium.launch({ channel: 'chrome', headless: true }); const p = await (await b.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
await p.goto('http://localhost:8080/login'); await p.fill('input[type=email]', 'admin@codemastery.local'); await p.fill('input[type=password]', 'ChangeMe123!'); await p.click('button[type=submit]'); await p.waitForURL((u) => !u.pathname.startsWith('/login'));
await p.goto('http://localhost:8080/create/pages/586'); await p.waitForTimeout(3000);
console.log('url', p.url()); console.log('text', (await p.locator('main, body').first().innerText()).replace(/\s+/g, ' ').slice(0, 300));
await p.screenshot({ path: process.argv[2] }); await b.close();
