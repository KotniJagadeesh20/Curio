// Step 14d-3 correction round, browser checks C1–C4 (run after seed14d3c.mjs). Usage: node t14d3c.mjs [runs-label]
//  C1  every iframe kind the renderer produces has its final box BEFORE its document loads (held for 2.5 s), and the box
//      doesn't change when a much taller document arrives.
//  C2  POP restoration with all iframes above the anchor still loading: settling ends without waiting for them (S2 as
//      implemented); when they load afterwards the anchor doesn't move.
//  C3  overflow-anchor: a previous INLINE value on <html> is put back after settling completes and after a user
//      cancellation (wheel); it is "none" only while settling.
//  C4  drawer focus: every focusin is recorded from the link click on; "Contents" never receives one. Positive control:
//      the current page's own link returns focus to "Contents" (the recorder sees Radix's close auto-focus).
//  C5  native-video correction (plan rev. 2): a real, decodable WebM recorded by Chrome itself (640×480, no binary in the
//      repo) served with a held response. C5a: Back with the video above the anchor and its metadata held → settling
//      waits; once the metadata arrives the video's box really changes (≥ 50 px) and the anchor ends ±2 px from where it
//      was saved. C5b: metadata held 7 s → settling still ends at the 5 s cap (the documented limitation).
//  C6  network-state correction. C6a: Chrome's own media state model, on which videoReady relies: a declared source
//      reports NETWORK_NO_SOURCE with currentSrc "" until resource selection starts (pending, NOT ready); every <source>
//      failed → NETWORK_NO_SOURCE with currentSrc set; a failed src → error; no source → NETWORK_EMPTY. C6b: Back with a
//      failing video before the anchor (404 held 2 s): settling waits for the failure, then ends well before the cap.
import { chromium } from 'playwright-core';
const BASE = 'http://localhost:8080';
const FR = '/@admin/embeds/part/frames', AF = '/@admin/embeds/part/after';
const results = [];
const check = (n, ok, d = '') => { results.push(!!ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${d ? '  — ' + d : ''}`); };
const near = (a, b, tol) => typeof a === 'number' && typeof b === 'number' && Math.abs(a - b) <= tol;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const TALL = '<!doctype html><body style="margin:0"><div style="height:3000px;background:#ddeeff">a tall embedded document</div></body>';

const browser = await chromium.launch({ channel: 'chrome', headless: true });
// the C5 fixture: Chrome records a 640×480 WebM from a canvas; served as https://videos.example.org/clip.webm
const maker = await browser.newPage();
const WEBM = Buffer.from(await maker.evaluate(async () => {
  const c = document.createElement('canvas'); c.width = 640; c.height = 480;
  const x = c.getContext('2d'); const rec = new MediaRecorder(c.captureStream(30), { mimeType: 'video/webm' }); const parts = [];
  rec.ondataavailable = (e) => parts.push(e.data); rec.start();
  let i = 0; const t = setInterval(() => { x.fillStyle = i++ % 2 ? '#c44' : '#48c'; x.fillRect(0, 0, 640, 480); }, 30);
  await new Promise((r) => setTimeout(r, 400)); rec.stop(); await new Promise((r) => { rec.onstop = r; }); clearInterval(t);
  return Array.from(new Uint8Array(await new Blob(parts).arrayBuffer()));
}));
await maker.close();
async function session(viewport = { width: 1280, height: 900 }) {
  const ctx = await browser.newContext({ viewport });
  const s = { ctx, errors: [], release: null, held: 0 };
  s.hold = () => { let r; const p = new Promise((res) => { r = res; }); s.release = r; s.gate = p; };
  s.hold(); s.release();                                       // open by default
  await ctx.addInitScript(() => {
    window.__focusins = [];
    document.addEventListener('focusin', (e) => { const t = e.target; window.__focusins.push(`${t.tagName}:${(t.textContent || '').trim().slice(0, 24)}`); }, true);
    window.__frameLoads = 0;
    document.addEventListener('load', (e) => { if (e.target && e.target.tagName === 'IFRAME') window.__frameLoads++; }, true);
    document.addEventListener('DOMContentLoaded', () => { const st = document.createElement('style'); st.textContent = '*{overflow-anchor:none !important}'; document.head.appendChild(st); });
  });
  const embed = async (route) => { s.held++; await s.gate; await route.fulfill({ status: 200, contentType: 'text/html', body: TALL }); };
  await ctx.route('https://www.youtube.com/embed/**', embed);
  await ctx.route('https://player.vimeo.com/**', embed);
  s.vhold = () => { let r; s.vgate = new Promise((res) => { r = res; }); s.vrelease = r; };
  s.vhold(); s.vrelease();
  await ctx.route('https://videos.example.org/**', async (route) => { await s.vgate; if (route.request().url().includes('broken')) await route.fulfill({ status: 404, body: '' }); else await route.fulfill({ status: 200, contentType: 'video/webm', body: WEBM }); });
  const page = await ctx.newPage();
  s.page = page;
  page.on('pageerror', (e) => s.errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') s.errors.push(m.text()); });
  return s;
}
const h1 = (p, name) => p.getByRole('heading', { level: 1, name, exact: true }).waitFor({ timeout: 12000 });
const frames = (p) => p.evaluate(() => [...document.querySelectorAll('article iframe')].map((f) => { const r = f.getBoundingClientRect(); return { kind: f.srcdoc ? 'html' : new URL(f.src).host, w: Math.round(r.width), h: Math.round(r.height) }; }));
const markerTop = (p, id) => p.evaluate((id) => document.querySelector(`[data-scroll-anchor="${id}"]`)?.getBoundingClientRect().top ?? null, id);
// a click with no scrolling into view (Playwright's click would scroll to the link first, a real user scroll that gets saved)
const jsClick = (p, sel) => p.evaluate((s) => document.querySelector(s).click(), sel);
const inlineAnchor = (p) => p.evaluate(() => document.documentElement.style.overflowAnchor);

// C1 iframe boxes before / after their documents load
{
  const S = await session(); const p = S.page;
  S.hold();
  await p.goto(BASE + FR); await h1(p, 'Frames');
  await p.evaluate(() => [...document.querySelectorAll('article iframe')].forEach((f) => f.scrollIntoView({ block: 'center', behavior: 'instant' })));   // lazy html frames start loading
  await p.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
  await sleep(400);
  const before = await frames(p);
  const loadsBefore = await p.evaluate(() => window.__frameLoads);
  await sleep(2500);
  S.release();
  await p.waitForFunction(() => window.__frameLoads >= 4, null, { timeout: 10000 });
  await sleep(400);
  const after = await frames(p);
  const kinds = before.map((f) => f.kind).join(',');
  const videoOk = before.filter((f) => f.kind !== 'html').every((f) => near(f.h, f.w * 9 / 16, 2));
  const htmlOk = JSON.stringify(before.filter((f) => f.kind === 'html').map((f) => f.h)) === JSON.stringify([300, 360]);   // 300 / the default 360 (border-box)
  check('C1 every iframe kind has its final box before its document loads (videos 16:9, HTML blocks their height)', before.length === 4 && videoOk && htmlOk && S.held >= 2,
    `${kinds} before=${JSON.stringify(before.map((f) => [f.w, f.h]))} iframe load events before the embeds were released: ${loadsBefore} (the 2 HTML frames at most)`);
  check('C1 a 3000 px document arriving changes no iframe box', JSON.stringify(before) === JSON.stringify(after), `after=${JSON.stringify(after.map((f) => [f.w, f.h]))}`);
  await S.ctx.close();
}

// C2 + C3: POP restoration below still-loading iframes; overflow-anchor inline value restored
{
  const S = await session(); const p = S.page;
  await p.goto(BASE + FR); await h1(p, 'Frames'); await sleep(800);
  await p.evaluate(() => { const el = document.querySelector('[data-scroll-anchor="block-b14"]'); window.scrollTo({ top: window.scrollY + el.getBoundingClientRect().top - 140, behavior: 'instant' }); });
  await sleep(300);
  const saved = await markerTop(p, 'block-b14');
  await p.evaluate(() => { document.documentElement.style.overflowAnchor = 'auto'; });   // a previous INLINE value
  await jsClick(p, 'a[aria-label^="Next"]'); await h1(p, 'After'); await sleep(400);
  S.hold();
  const loads0 = await p.evaluate(() => window.__frameLoads);
  await p.goBack(); await h1(p, 'Frames');
  const during = await inlineAnchor(p);
  await sleep(1500);                                            // ≥ 500 ms stable: settling ends; embeds still held
  const ended = await inlineAnchor(p);
  const pendingVideos = (await p.evaluate(() => window.__frameLoads)) - loads0 < 4;
  const restored = await markerTop(p, 'block-b14');
  check('C2 settling ends while the iframes above the anchor are still loading (not held to the 5 s cap); anchor restored', pendingVideos && ended === 'auto' && near(restored, saved, 2),
    `saved ${saved} restored ${restored}; inline overflow-anchor during=${during} after=${ended}; embeds pending=${pendingVideos}`);
  S.release();
  await p.waitForFunction((n) => window.__frameLoads >= n + 4, loads0, { timeout: 10000 });
  await sleep(500);
  const later = await markerTop(p, 'block-b14');
  check('C2 the embeds loading afterwards don\'t move the anchor', near(later, restored, 1), `before ${restored} after ${later}`);
  check('C3 overflow-anchor: "none" while settling, the previous inline value ("auto") after completion', during === 'none' && ended === 'auto', `during=${during} after=${ended}`);
  // C3 cancellation: Back again, wheel immediately
  await jsClick(p, 'a[aria-label^="Next"]'); await h1(p, 'After'); await sleep(400);
  await p.evaluate(() => { document.documentElement.style.overflowAnchor = 'auto'; });
  S.hold();
  await p.goBack(); await h1(p, 'Frames');
  const during2 = await inlineAnchor(p);
  await p.mouse.move(600, 500); await p.mouse.wheel(0, 200); await sleep(150);
  const afterWheel = await inlineAnchor(p);
  S.release();
  check('C3 overflow-anchor: the previous inline value after a user cancellation (wheel)', during2 === 'none' && afterWheel === 'auto', `during=${during2} after wheel=${afterWheel}`);
  await p.evaluate(() => { document.documentElement.style.overflowAnchor = ''; });
  check('C1–C3 no page errors', S.errors.length === 0, S.errors.slice(0, 3).join(' | '));
  await S.ctx.close();
}

// C4 drawer focus at 360 px
{
  const S = await session({ width: 360, height: 780 }); const p = S.page;
  await p.goto(BASE + '/@admin/long-read/part/one'); await h1(p, 'One'); await sleep(500);
  await p.getByRole('button', { name: 'Contents' }).click(); await p.getByRole('dialog').waitFor(); await sleep(400);
  const start = await p.evaluate(() => window.__focusins.length);
  await p.getByRole('dialog').getByRole('link', { name: 'Two' }).click();
  await h1(p, 'Two'); await sleep(800);
  const log = await p.evaluate((n) => window.__focusins.slice(n), start);
  const active = await p.evaluate(() => `${document.activeElement.tagName}:${document.activeElement.textContent.trim()}`);
  check('C4 drawer link to another page: every focusin recorded; "Contents" never among them; heading focused', !log.some((x) => x === 'BUTTON:Contents') && active === 'H1:Two', `focusins=${JSON.stringify(log)} active=${active}`);
  await p.getByRole('button', { name: 'Contents' }).click(); await p.getByRole('dialog').waitFor(); await sleep(400);
  const start2 = await p.evaluate(() => window.__focusins.length);
  await p.getByRole('dialog').getByRole('link', { name: 'Two' }).click();       // the current page's own link
  await sleep(800);
  const log2 = await p.evaluate((n) => window.__focusins.slice(n), start2);
  check('C4 control: the current page\'s own link → the recorder sees focus return to "Contents"', log2.includes('BUTTON:Contents'), `focusins=${JSON.stringify(log2)}`);
  await S.ctx.close();
}

// C5 native video above the anchor
{
  const S = await session(); const p = S.page;
  const CL = '/@admin/embeds/media/clip';
  const video = () => p.evaluate(() => { const v = document.querySelector('article video'); return { h: Math.round(v.getBoundingClientRect().height), rs: v.readyState }; });
  await p.goto(BASE + CL); await h1(p, 'Clip');
  await p.waitForFunction(() => document.querySelector('article video')?.readyState >= 1, null, { timeout: 10000 }); await sleep(400);
  await p.evaluate(() => { const el = document.querySelector('[data-scroll-anchor="block-b14"]'); window.scrollTo({ top: window.scrollY + el.getBoundingClientRect().top - 140, behavior: 'instant' }); });
  await sleep(300);
  const saved = await markerTop(p, 'block-b14');
  // C5a
  await jsClick(p, 'a[aria-label^="Next"]'); await h1(p, 'Clip end'); await sleep(400);
  S.vhold();
  await p.goBack(); await h1(p, 'Clip'); await sleep(300);
  const pre = await video();
  await sleep(1200);                                            // well past the 500 ms stable time
  const held = await inlineAnchor(p);
  const midTop = await markerTop(p, 'block-b14');
  S.vrelease();
  await p.waitForFunction(() => document.querySelector('article video').readyState >= 1, null, { timeout: 10000 });
  await sleep(700);
  const post = await video();
  const finalTop = await markerTop(p, 'block-b14');
  await sleep(800);
  const ended = await inlineAnchor(p);
  check('C5a precondition: the video\'s box really changes when its metadata arrives (≥ 50 px)', pre.rs === 0 && post.rs >= 1 && post.h - pre.h >= 50, `before ${pre.h} px (readyState ${pre.rs}) → after ${post.h} px (readyState ${post.rs})`);
  check('C5a settling waits for the video before the anchor (still "none" at 1.5 s, held metadata)', held === 'none', `inline overflow-anchor at 1.5 s=${held}; anchor top meanwhile ${midTop}`);
  check('C5a after the metadata arrives the anchor is where it was saved (±2 px); settling then ends', near(finalTop, saved, 2) && ended === '', `saved ${saved} final ${finalTop}; inline afterwards=${JSON.stringify(ended)}`);
  // C5b
  await jsClick(p, 'a[aria-label^="Next"]'); await h1(p, 'Clip end'); await sleep(400);
  S.vhold();
  const t0 = Date.now();
  await p.goBack(); await h1(p, 'Clip');
  // first see settling START (inline "none"), so a not-yet-started restoration can't read as "ended"
  await p.waitForFunction(() => document.documentElement.style.overflowAnchor === 'none', null, { timeout: 3000, polling: 10 });
  await p.waitForFunction(() => document.documentElement.style.overflowAnchor === '', null, { timeout: 9000, polling: 50 });
  const endedAfter = Date.now() - t0;
  const rs = (await video()).rs;
  check('C5b metadata held 7 s: settling still ends at the 5 s cap (the cap is authoritative)', rs === 0 && endedAfter >= 4500 && endedAfter <= 6500, `settling ended after ${endedAfter} ms with readyState ${rs}`);
  await sleep(Math.max(0, 7000 - (Date.now() - t0))); S.vrelease();
  check('C5 no page errors', S.errors.length === 0, S.errors.slice(0, 3).join(' | '));
  await S.ctx.close();
}

// C6 network states
{
  const S = await session(); const p = S.page;
  // C6a: Chrome's state model (a scratch page; the 404s are this script's own)
  await p.goto(BASE + '/@admin/embeds/media/clip-end'); await h1(p, 'Clip end');
  S.vhold();
  const model = await p.evaluate(async () => {
    const st = (v) => ({ ns: v.networkState, err: v.error ? v.error.code : null, cur: v.currentSrc });
    const host = document.createElement('div'); host.hidden = true; document.body.append(host);
    const a = document.createElement('video'); a.src = 'https://videos.example.org/broken-a.webm'; host.append(a);
    const b = document.createElement('video');
    for (const u of ['broken-b1', 'broken-b2']) { const s = document.createElement('source'); s.src = `https://videos.example.org/${u}.webm`; b.append(s); }
    host.append(b);
    const n = document.createElement('video'); host.append(n);
    const pending = { src: st(a), sources: st(b), none: st(n) };
    return { pending };
  });
  S.vrelease();
  await sleep(1500);
  const done = await p.evaluate(() => { const [a, b, n] = document.querySelectorAll('div[hidden] video'); const st = (v) => ({ ns: v.networkState, err: v.error ? v.error.code : null, cur: v.currentSrc }); const r = { src: st(a), sources: st(b), none: st(n) }; document.querySelector('div[hidden]').remove(); return r; });
  const pend = model.pending;
  check('C6a Chrome: a declared source before selection starts is NETWORK_NO_SOURCE with currentSrc "" and no error (pending)', pend.src.ns === 3 && pend.src.cur === '' && pend.src.err === null && pend.sources.ns === 3 && pend.sources.cur === '' && pend.sources.err === null, JSON.stringify(pend));
  check('C6a Chrome: failed src → error set; every <source> failed → NETWORK_NO_SOURCE, error null, currentSrc set; no source → NETWORK_EMPTY', done.src.err !== null && done.sources.ns === 3 && done.sources.err === null && done.sources.cur !== '' && done.none.ns === 0 && done.none.cur === '', JSON.stringify(done));
  // C6b: a failing video before the anchor
  const BR = '/@admin/embeds/media/broken-clip';
  await p.goto(BASE + BR); await h1(p, 'Broken clip');
  await p.waitForFunction(() => document.querySelector('article video')?.error !== null, null, { timeout: 10000 }); await sleep(300);
  await p.evaluate(() => { const el = document.querySelector('[data-scroll-anchor="block-b14"]'); window.scrollTo({ top: window.scrollY + el.getBoundingClientRect().top - 140, behavior: 'instant' }); });
  await sleep(300);
  const saved = await markerTop(p, 'block-b14');
  await jsClick(p, 'a[aria-label^="Previous"]'); await h1(p, 'Clip end'); await sleep(400);
  S.vhold();
  const t0 = Date.now();
  await p.goBack(); await h1(p, 'Broken clip');
  await p.waitForFunction(() => document.documentElement.style.overflowAnchor === 'none', null, { timeout: 3000, polling: 10 });
  await sleep(1200);
  const held = await inlineAnchor(p);
  const errHeld = await p.evaluate(() => document.querySelector('article video').error);
  S.vrelease();
  const tRel = Date.now() - t0;
  await p.waitForFunction(() => document.documentElement.style.overflowAnchor === '', null, { timeout: 9000, polling: 50 });
  const ended = Date.now() - t0;
  const err = await p.evaluate(() => document.querySelector('article video').error?.code ?? null);
  const top = await markerTop(p, 'block-b14');
  check('C6b a failing video before the anchor: settling waits while its source is pending, ends soon after the failure (well before the cap); anchor ±2 px',
    held === 'none' && errHeld === null && err !== null && ended - tRel < 1500 && ended < 4500 && near(top, saved, 2),
    `pending at 1.2 s: inline=${held}; released at ${tRel} ms, settling ended at ${ended} ms (error ${err}); saved ${saved} final ${top}`);
  check('C6 no page errors', S.errors.every((e) => /404/.test(e)), S.errors.filter((e) => !/404/.test(e)).slice(0, 3).join(' | '));
  await S.ctx.close();
}

await browser.close();
const pass = results.filter(Boolean).length;
console.log(`\n${pass}/${results.length} checks passed`);
process.exit(pass === results.length ? 0 : 1);
