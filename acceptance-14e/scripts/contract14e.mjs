// Step 14e-2 live API contract check (plan rev. 2 §4, Q-e3). Run after seed14e.mjs against the same fresh backend.
// Every field the public frontend READS is asserted by name, type and nullability, including nested objects and arrays.
// The responses are fetched from inside a browser page on the app origin (the same path the app uses), so the negative
// control can alter them by route interception:  env NEG=c → modules[].pages[].slug is renamed to `pageSlug` → must FAIL.
// Unknown extra fields are reported as INFO, never as failures.
//
// Field list — derived from src/lib/types.ts (Public*), and from the fields actually read in the public views:
//   Discover.tsx (data.items, data.totalItems, data.totalPages; categories c.slug, c.name), CollectionCard.tsx
//   (slug, title, description, coverUrl, coverThumbUrl, category.name, creator.username/displayName, moduleCount,
//   pageCount), CollectionView.tsx (detail.collection.*, detail.unlisted, detail.modules, c.category.slug/name),
//   CollectionOutline.tsx + publicNav.ts (modules[].slug/title/position, pages[].slug/title/summary/position),
//   PageNav.tsx (via publicNav), PageView.tsx (collection.slug/title/unlisted/creator, module.slug/title,
//   page.title/summary/blocks/legacy), PublicBlocks.tsx + publicBlocks.ts (per-block-type fields, below).
import { chromium } from 'playwright-core';
import fs from 'fs';
const BASE = 'http://localhost:8080', API = 'http://localhost:8081/api';
const NEG = process.env.NEG ?? '';
const seed = JSON.parse(fs.readFileSync(new URL('./seed14e.json', import.meta.url)));
const UA = seed.aUser, UB = seed.bUser;
const results = [];
const check = (n, ok, d = '') => { results.push({ n, ok: !!ok }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${d ? '  — ' + d : ''}`); };
const info = [];

// ---- schema DSL: 'string' | 'number' | 'boolean' | {obj} | [elem] ; nullable via n(x) ; optional via opt(x) -----------
const n = (t) => ({ $nullable: t }), opt = (t) => ({ $optional: t });
const CREATOR = { username: 'string', displayName: 'string' };
const CATEGORY_REF = { slug: 'string', name: 'string' };
const SUMMARY = { slug: 'string', title: 'string', description: 'string', coverUrl: n('string'), coverThumbUrl: n('string'),
  category: n(CATEGORY_REF), creator: CREATOR, moduleCount: 'number', pageCount: 'number' };
const PAGED = { items: [SUMMARY], page: 'number', size: 'number', totalItems: 'number', totalPages: 'number' };
const CATEGORIES = [{ slug: 'string', name: 'string' }];
const DETAIL = { collection: SUMMARY, unlisted: 'boolean',
  modules: [{ slug: 'string', title: 'string', position: 'number', pages: [{ slug: 'string', title: 'string', summary: 'string', position: 'number' }] }] };
const PAGE_VIEW = { collection: { slug: 'string', title: 'string', creator: CREATOR, unlisted: 'boolean' },
  module: { slug: 'string', title: 'string' },
  page: { slug: 'string', title: 'string', summary: 'string', blocks: n(['block']), legacy: n('object') } };
// Blocks by type: the fields publicBlocks.ts sanitizeOne reads. Fields the seed sets are REQUIRED here (the seeded
// content must render in full); fields publicBlocks treats as optional and the seed doesn't set are optional.
const BLOCKS = {
  text: { type: 'string', text: 'string', doc: opt('any') },
  heading: { type: 'string', text: 'string', level: 'number' },
  code: { type: 'string', code: 'string', language: 'string', caption: 'string' },
  image: { type: 'string', url: 'string', caption: 'string', width: 'number', height: 'number' },
  video: { type: 'string', url: 'string', caption: 'string' },
  svg: { type: 'string', svg: 'string', caption: 'string' },
  callout: { type: 'string', text: 'string', variant: 'string' },
  table: { type: 'string', rows: [['string']], hasHeader: 'boolean', caption: 'string' },
};
const CONSUMED = new Set(['id']);   // `id` is present in stored blocks but the public renderer re-assigns it (not consumed)

function validate(v, t, path, errs) {
  if (t && typeof t === 'object' && '$optional' in t) { if (v === undefined) return; return validate(v, t.$optional, path, errs); }
  if (v === undefined) { errs.push(`${path}: missing`); return; }
  if (t && typeof t === 'object' && '$nullable' in t) { if (v === null) return; return validate(v, t.$nullable, path, errs); }
  if (v === null) { errs.push(`${path}: null (not nullable)`); return; }
  if (t === 'any') return;
  if (t === 'block') {
    const spec = BLOCKS[v?.type];
    if (!spec) { errs.push(`${path}: unexpected block type ${JSON.stringify(v?.type)}`); return; }
    return validate(v, spec, `${path}<${v.type}>`, errs);
  }
  if (typeof t === 'string') {
    const ok = t === 'object' ? typeof v === 'object' && !Array.isArray(v) : typeof v === t && (t !== 'number' || Number.isFinite(v));
    if (!ok) errs.push(`${path}: expected ${t}, got ${Array.isArray(v) ? 'array' : typeof v}`);
    return;
  }
  if (Array.isArray(t)) {
    if (!Array.isArray(v)) { errs.push(`${path}: expected array, got ${typeof v}`); return; }
    v.forEach((x, i) => validate(x, t[0], `${path}[${i}]`, errs));
    return;
  }
  if (typeof v !== 'object' || Array.isArray(v)) { errs.push(`${path}: expected object, got ${Array.isArray(v) ? 'array' : typeof v}`); return; }
  for (const k of Object.keys(t)) validate(v[k], t[k], `${path}.${k}`, errs);
  for (const k of Object.keys(v)) if (!(k in t) && !CONSUMED.has(k)) info.push(`${path}.${k}`);
}

// ---- fetch through a browser page on the app origin -------------------------------------------------------------------
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const ctx = await browser.newContext();
if (NEG === 'c') await ctx.route('**/api/public/collections/*/*', async (route) => {
  const res = await route.fetch(); const body = await res.json();
  for (const m of body.modules ?? []) for (const p of m.pages ?? []) { p.pageSlug = p.slug; delete p.slug; }
  console.log(`NEG c: renamed modules[].pages[].slug → pageSlug in ${new URL(route.request().url()).pathname}`);
  await route.fulfill({ response: res, json: body });
});
const page = await ctx.newPage();
await page.goto(BASE + '/discover');
const get = (path) => page.evaluate(async (u) => { const r = await fetch(u); return { status: r.status, body: await r.json().catch(() => null) }; }, API + path);

const TARGETS = [
  ['Discover list ?q=java', '/public/collections?q=java&page=0&size=12', PAGED],
  ['Discover list ?q=travel', '/public/collections?q=travel&page=0&size=12', PAGED],
  ['Categories', '/public/categories', CATEGORIES],
  ['Collection detail Java Learning', `/public/collections/${UA}/java-learning`, DETAIL],
  ['Collection detail Travel Experiences', `/public/collections/${UB}/travel-experiences`, DETAIL],
  ['Collection detail Java Notes (unlisted)', `/public/collections/${UA}/java-notes`, DETAIL],
  ...[['core-java', 'hello-java'], ['core-java', 'the-jvm'], ['core-java', 'collections']].map(([m, p]) => [`Page view A ${p}`, `/public/pages/${UA}/java-learning/${m}/${p}`, PAGE_VIEW]),
  ...[['lisbon', 'arrival'], ['lisbon', 'tram-28'], ['porto', 'ribeira']].map(([m, p]) => [`Page view B ${p}`, `/public/pages/${UB}/travel-experiences/${m}/${p}`, PAGE_VIEW]),
];
const blockTypesSeen = new Set();
for (const [label, path, schema] of TARGETS) {
  const { status, body } = await get(path);
  const errs = [];
  if (status !== 200) errs.push(`HTTP ${status}`); else validate(body, schema, '$', errs);
  for (const b of body?.page?.blocks ?? []) blockTypesSeen.add(b.type);
  check(`[contract] ${label}: every consumed field present with the right type/nullability (nested)`, errs.length === 0, errs.slice(0, 5).join(' | ') || path);
}
// the seeded content must reach the contract for every block type it uses, and the searches must hit the seeded cards
check('[contract] block types covered by the seeded pages', ['text', 'heading', 'code', 'image', 'video', 'svg', 'callout', 'table'].every((t) => blockTypesSeen.has(t)), [...blockTypesSeen].sort().join(','));
const javaList = (await get('/public/collections?q=java&page=0&size=12')).body;
check('[contract] Discover ?q=java lists "Java Learning" (and not the draft/unlisted collections)', javaList?.items?.some((c) => c.slug === 'java-learning') && !javaList?.items?.some((c) => ['java-drafts', 'java-notes'].includes(c.slug)), (javaList?.items ?? []).map((c) => c.slug).join(','));

await browser.close();
console.log(`INFO  unknown extra fields (not consumed; informational): ${[...new Set(info.map((p) => p.replace(/\[\d+\]/g, '[]')))].sort().join(', ') || 'none'}`);
const pass = results.filter((r) => r.ok).length;
console.log(`\n${pass}/${results.length} checks passed${NEG ? ` (NEG ${NEG})` : ''}`);
process.exit(pass === results.length ? 0 : 1);
