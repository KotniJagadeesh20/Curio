import { chromium } from 'playwright-core';
export const BASE = 'http://localhost:8080';
export const SHOTS = '../screenshots';
export const results = [];
export function check(name, ok, detail = '') { results.push({ name, ok: !!ok, detail }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`); }
export async function setup(viewport = { width: 1280, height: 900 }) {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const ctx = await browser.newContext({ viewport });
  const page = await ctx.newPage();
  const errors = [], failed = [];
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('response', r => { if (r.status() >= 400) failed.push(`${r.status()} ${r.request().method()} ${r.url()}`); });
  page.on('requestfailed', r => failed.push(`FAILED ${r.method()} ${r.url()} ${r.failure()?.errorText}`));
  return { browser, ctx, page, errors, failed };
}
export async function login(page) {
  await page.goto(BASE + '/login');
  await page.fill('input[type=email]', 'admin@codemastery.local');
  await page.fill('input[type=password]', 'ChangeMe123!');
  await page.click('button[type=submit]');
  await page.waitForURL(u => !u.pathname.startsWith('/login'));
}
/** Human-like key press: Radix moves roving focus in a setTimeout and selects only while the arrow is still held. */
export async function hold(page, key, ms = 60) { await page.keyboard.down(key); await page.waitForTimeout(ms); await page.keyboard.up(key); await page.waitForTimeout(50); }
