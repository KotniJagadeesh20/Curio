// Step 14e-2 accessibility scan (plan rev. 2 §4, Q-e1). REPORT-ONLY: findings never fail the run; the exit code is non-zero
// only when a scan could not be performed (view didn't render, axe didn't run).
// Views: Discover, the collection, every Scenario A/B page (together they hold every block type), not-available and the
// error state (page API stubbed to 503 by interception in this script only), each at 1280 px and 360 px.
// Third-party embeds are intercepted as in t14e.mjs. axe-core is loaded from the run directory's node_modules.
// Usage: node axe14e.mjs <out json>
import { chromium } from 'playwright-core';
import fs from 'fs';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const AXE = fs.readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8');
const AXE_VERSION = require('axe-core/package.json').version;
const BASE = 'http://localhost:8080';
const OUT = process.argv[2] ?? 'axe14e.json';
const seed = JSON.parse(fs.readFileSync(new URL('./seed14e.json', import.meta.url)));
const UA = seed.aUser, UB = seed.bUser;
const JL = `/@${UA}/java-learning`, TE = `/@${UB}/travel-experiences`;
const VIEWS = [
  ['Discover', '/discover', { h1: true }],
  ['Collection (Java Learning)', JL, { h1: 'Java Learning' }],
  ['Collection (Travel Experiences)', TE, { h1: 'Travel Experiences' }],
  ['Page A1 (text: bold/italic/link/list, heading)', `${JL}/core-java/hello-java`, { h1: 'Hello, Java' }],
  ['Page A2 (svg)', `${JL}/core-java/the-jvm`, { h1: 'The JVM' }],
  ['Page A3 (code, table)', `${JL}/core-java/collections`, { h1: 'Collections', monaco: true }],
  ['Page B1 (image, callouts)', `${TE}/lisbon/arrival`, { h1: 'Arrival' }],
  ['Page B2 (video, image)', `${TE}/lisbon/tram-28`, { h1: 'Tram 28' }],
  ['Page B3 (text)', `${TE}/porto/ribeira`, { h1: 'Ribeira' }],
  ['Not available (A-draft)', `${JL}/core-java/generics-draft`, { testid: 'not-available' }],
  ['Error state (page API 503)', `${JL}/core-java/hello-java`, { error: true }],
];
const VIEWPORTS = [{ width: 1280, height: 900 }, { width: 360, height: 780 }];
const EMBED_HTML = '<!doctype html><title>video</title><body style="margin:0;background:#111"></body>';

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const report = { axeVersion: AXE_VERSION, scans: [] };
let scanFailures = 0;
for (const vp of VIEWPORTS) {
  for (const [label, path, want] of VIEWS) {
    const ctx = await browser.newContext({ viewport: vp });
    await ctx.route('https://www.youtube.com/**', (r) => r.fulfill({ status: 200, contentType: 'text/html', body: EMBED_HTML }));
    await ctx.route('https://www.youtube-nocookie.com/**', (r) => r.fulfill({ status: 200, contentType: 'text/html', body: EMBED_HTML }));
    if (want.error) await ctx.route('**/api/public/pages/**', (r) => r.fulfill({ status: 503, contentType: 'application/json', body: '{"error":"Service unavailable"}' }));
    const page = await ctx.newPage();
    let rendered = false;
    try {
      await page.goto(BASE + path);
      if (want.error) rendered = await page.getByRole('button', { name: 'Try again' }).waitFor({ timeout: 15000 }).then(() => true, () => false);
      else if (want.testid) rendered = await page.getByTestId(want.testid).waitFor({ timeout: 12000 }).then(() => true, () => false);
      else if (want.h1 === true) rendered = await page.getByTestId('collection-card').first().waitFor({ timeout: 12000 }).then(() => true, () => false);
      else rendered = await page.getByRole('heading', { level: 1, name: want.h1, exact: true }).waitFor({ timeout: 12000 }).then(() => true, () => false);
      if (want.monaco) await page.locator('.monaco-editor').first().waitFor({ timeout: 15000 }).catch(() => {});
      await page.waitForTimeout(800);
      await page.addScriptTag({ content: AXE });
      const r = await page.evaluate(async () => {
        const res = await window.axe.run(document, { resultTypes: ['violations'] });
        return res.violations.map((v) => ({ id: v.id, impact: v.impact, help: v.help, nodes: v.nodes.map((n) => n.target.join(' ')) }));
      });
      const scan = { view: label, path, viewport: `${vp.width}px`, rendered, violations: r };
      report.scans.push(scan);
      const by = (lvl) => r.filter((v) => v.impact === lvl);
      console.log(`${rendered ? 'SCAN' : 'FAIL'}  ${label} @ ${vp.width}px — critical ${by('critical').length}, serious ${by('serious').length}, moderate ${by('moderate').length}, minor ${by('minor').length} (rules)`);
      if (!rendered) scanFailures++;
    } catch (e) {
      scanFailures++; console.log(`FAIL  ${label} @ ${vp.width}px — scan error: ${e.message.split('\n')[0]}`);
      report.scans.push({ view: label, path, viewport: `${vp.width}px`, error: e.message.split('\n')[0] });
    }
    await ctx.close();
  }
}
await browser.close();

// ---- report: serious/critical listed individually (view, viewport, rule, target, count); moderate/minor counted --------
console.log(`\naxe-core ${AXE_VERSION}`);
console.log('SERIOUS / CRITICAL findings (view | viewport | impact | rule | count | targets):');
let sc = 0; const counts = { moderate: 0, minor: 0 };
for (const s of report.scans) for (const v of s.violations ?? []) {
  if (v.impact === 'serious' || v.impact === 'critical') { sc++; console.log(`  ${s.view} | ${s.viewport} | ${v.impact} | ${v.id} | ${v.nodes.length} | ${v.nodes.join(' ; ')}`); }
  else if (v.impact in counts) counts[v.impact] += v.nodes.length;
}
if (sc === 0) console.log('  none');
console.log(`MODERATE nodes: ${counts.moderate} · MINOR nodes: ${counts.minor}`);
for (const s of report.scans) for (const v of s.violations ?? []) if (v.impact === 'moderate' || v.impact === 'minor') console.log(`  (${v.impact}) ${s.view} | ${s.viewport} | ${v.id} | ${v.nodes.length}`);
fs.writeFileSync(OUT, JSON.stringify(report, null, 2));
console.log(`\n${report.scans.length - scanFailures}/${report.scans.length} scans performed (report-only; findings do not fail the run)`);
process.exit(scanFailures === 0 ? 0 : 1);
