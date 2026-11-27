// Step 15d-1 contract15 (plan rev. 4 §3, §3.1; execution prompt rev. 12 §3). Node built-ins only.
//
// Endpoints and fields used (discovered read-only from backend/src/main/java, ⚑Q5):
//   POST /api/auth/signup            {name, email, password, username}          -> 201 {token, user}   (AuthController, AuthDtos.SignupRequest)
//   GET  /api/users/me                                                          -> {user, profile}     (UserController, UserDtos.MeResponse)
//   PUT  /api/users/me/profile       {displayName, bio, avatarUrl, bannerUrl, socialLinks, visibility} (ProfileService; unknown keys = 400)
//   GET  /api/public/creators/{u}                                               -> PublicCreatorDto     (PublicCreatorController)
//   GET  /api/public/categories                                                 -> [{id, slug, name, …}] (PublicCategoryController)
//   POST /api/collections            {title, slug, description, categoryId}     -> 201 CollectionSummary (CollectionController)
//   POST /api/collections/{id}/modules {title, slug}                            -> 201 ModuleDto
//   POST /api/modules/{id}/pages     {title, slug, summary, blocks}             -> 201 PageDto (always DRAFT)  (ModuleController)
//   POST /api/pages/{id}/publish                                                -> PageDto              (PageController)
//   POST /api/collections/{id}/publish {status:"PUBLISHED"}                     -> CollectionSummary (PUBLISHED = listed)
//   GET  /api/public/collections?creator={u}                                    -> PagedResult<PublicCollectionSummary>
// A collection is listed publicly only when PUBLISHED and it has at least one published page (PublicCollectionService),
// so setup creates one module with one published page, no cover, and the first public category.
//
// Usage (exit 0 = all PASS, 1 = assertion FAIL(s), 2 = usage error, 3 = crash; SUMMARY is never printed after a crash):
//   node contract15.mjs --part N --base <url> --out <dir>
//   node contract15.mjs --part S --phase setup  --base <url> --out <dir>
//   node contract15.mjs --part S --phase assert --base <url> --out <dir> --n6 <dir>
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

// Expected type of N5.1g joinedAt. The negative control (⚑Q11) flips this one constant to 'number'.
const N51G_TYPE = 'string';

function usage(msg) { console.error(`usage error: ${msg}`); process.exit(2); }
const argv = process.argv.slice(2);
const A = {};
for (let i = 0; i < argv.length; i += 2) {
  const k = argv[i], v = argv[i + 1];
  if (!['--part', '--phase', '--base', '--out', '--n6'].includes(k)) usage(`unknown argument ${k}`);
  if (v === undefined || v.startsWith('--')) usage(`missing value for ${k}`);
  if (A[k.slice(2)] !== undefined) usage(`duplicate ${k}`);
  A[k.slice(2)] = v;
}
if (!['N', 'S'].includes(A.part)) usage('--part must be N or S');
if (!A.base || !/^https?:\/\/[^/]+$/.test(A.base)) usage('--base must be a URL like http://localhost:8081');
if (!A.out) usage('--out is required');
if (A.part === 'N' && A.phase !== undefined) usage('--phase is rejected for part N');
if (A.part === 'S' && !['setup', 'assert'].includes(A.phase)) usage('--phase setup|assert is required for part S');
if (A.phase === 'assert' && !A.n6) usage('--n6 is required for --phase assert');
if (A.phase !== 'assert' && A.n6 !== undefined) usage('--n6 is only allowed with --phase assert');

const OUT = path.resolve(A.out);
// Repository root = the working directory (rev. 13). The runner must invoke every copy of this script with cwd = repo root.
// Fail closed (exit 2, before any HTTP request) unless all three marker files exist there.
const R = path.resolve(process.cwd());
for (const m of ['src/lib/types.ts', 'backend/pom.xml', 'acceptance-15/scripts/contract15.mjs']) {
  if (!fs.existsSync(path.join(R, m))) usage(`working directory ${R} is not the Curio repository root (missing ${m})`);
}
let pass = 0, fail = 0;
const lines = [];
const say = (s) => { console.log(s); lines.push(s); };
const P = (id, ok, detail = '') => { say(`${ok ? 'PASS' : 'FAIL'} ${id} ${detail}`.trimEnd()); ok ? pass++ : fail++; return ok; };
const INFO = (id, detail) => say(`INFO ${id} ${detail}`);

// ---------- HTTP with full recording (status, headers, body). Authorization headers are never recorded. ----------
let httpDir = null, seq = 0;
const publicTexts = []; // raw bodies of every /api/public response in this invocation
async function http(label, method, p, { token, body } = {}) {
  const headers = {};
  if (body !== undefined) headers['content-type'] = 'application/json';
  if (token) headers.authorization = 'Bearer ' + token;
  const r = await fetch(A.base + p, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  const buf = Buffer.from(await r.arrayBuffer());
  const text = buf.toString('utf8');
  const hdrs = {}; r.headers.forEach((v, k) => { hdrs[k] = v; });
  seq++;
  const rec = { seq, label, request: { method, path: p, authenticated: !!token, body: body === undefined ? null : body },
    response: { status: r.status, headers: hdrs, body: text } };
  fs.writeFileSync(path.join(httpDir, `${String(seq).padStart(3, '0')}-${label.replace(/[^A-Za-z0-9_.-]/g, '_')}.json`), JSON.stringify(rec, null, 2));
  if (p.startsWith('/api/public/')) publicTexts.push({ label, text });
  let json; try { json = text ? JSON.parse(text) : null; } catch { json = undefined; }
  return { status: r.status, ct: r.headers.get('content-type'), text, buf, json };
}
async function must(label, method, p, opts, expect) {
  const r = await http(label, method, p, opts);
  if (r.status !== expect) throw new Error(`setup step ${label}: ${method} ${p} -> ${r.status} (expected ${expect}) ${r.text.slice(0, 300)}`);
  return r.json;
}

// ---------- helpers ----------
const isObj = (x) => x !== null && typeof x === 'object' && !Array.isArray(x);
const keysExactly = (o, ks) => isObj(o) && JSON.stringify(Object.keys(o).sort()) === JSON.stringify([...ks].sort());
const tname = (x) => x === null ? 'null' : Array.isArray(x) ? 'array' : typeof x;
const isHttps = (x) => typeof x === 'string' && x.startsWith('https://');
const strValues = (o) => isObj(o) && Object.values(o).every((v) => typeof v === 'string');
const deq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
function hasKeyDeep(x, keys) {
  if (Array.isArray(x)) return x.some((y) => hasKeyDeep(y, keys));
  if (isObj(x)) return Object.keys(x).some((k) => keys.includes(k) || hasKeyDeep(x[k], keys));
  return false;
}
const containsAny = (text, needles) => needles.some((n) => text.toLowerCase().includes(n.toLowerCase()));
const PW = 'Contract15-Pass!';

async function signup(username, email, name) {
  const j = await must(`signup-${username}`, 'POST', '/api/auth/signup', { body: { name, email, password: PW, username } }, 201);
  if (!j || !j.token || !j.user || j.user.username !== username) throw new Error(`signup ${username}: unexpected body`);
  return { token: j.token, username, email };
}
async function seedPublishedCollection(u, slug) {
  const cats = await must(`categories-${u.username}`, 'GET', '/api/public/categories', {}, 200);
  if (!Array.isArray(cats) || !cats.length || typeof cats[0].id !== 'number') throw new Error('no public category available');
  const cat = cats[0];
  const c = await must(`collection-create-${u.username}`, 'POST', '/api/collections',
    { token: u.token, body: { title: `C15 ${u.username} collection`, slug, description: `Contract15 collection of ${u.username}`, categoryId: cat.id } }, 201);
  const m = await must(`module-create-${u.username}`, 'POST', `/api/collections/${c.id}/modules`, { token: u.token, body: { title: 'Module one', slug: 'module-one' } }, 201);
  const pg = await must(`page-create-${u.username}`, 'POST', `/api/modules/${m.id}/pages`,
    { token: u.token, body: { title: 'Page one', slug: 'page-one', summary: 'First page', blocks: [{ id: 't1', type: 'text', text: 'Hello from contract15.' }] } }, 201);
  await must(`page-publish-${u.username}`, 'POST', `/api/pages/${pg.id}/publish`, { token: u.token }, 200);
  const pub = await must(`collection-publish-${u.username}`, 'POST', `/api/collections/${c.id}/publish`, { token: u.token, body: { status: 'PUBLISHED' } }, 200);
  if (pub.status !== 'PUBLISHED' || pub.categoryId !== cat.id || pub.coverUrl != null || pub.coverAssetId != null) throw new Error(`collection publish: unexpected ${JSON.stringify(pub)}`);
  return { slug, category: { slug: cat.slug, name: cat.name } };
}

// ---------- types.ts declarations (N1.4) ----------
function tsDecls() {
  const src = fs.readFileSync(path.join(R, 'src/lib/types.ts'), 'utf8');
  const out = {};
  for (const name of ['Profile', 'PublicCreator', 'PublicCollectionSummary', 'PublicCategoryRef', 'PublicCreatorRef', 'Paged']) {
    const m = src.match(new RegExp(`export interface ${name}(?:<[^>]*>)?\\s*\\{([\\s\\S]*?)\\n\\}`));
    if (!m) throw new Error(`types.ts: interface ${name} not found`);
    const fields = {};
    for (const line of m[1].split('\n')) {
      const f = line.match(/^\s*([A-Za-z_]\w*)(\??):\s*(.+?);\s*$/);
      if (!f) continue;
      const kinds = new Set();
      for (let part of f[3].split('|').map((s) => s.trim())) {
        if (part === 'null') kinds.add('null');
        else if (part === 'string' || /^".*"$/.test(part)) kinds.add('string');
        else if (part === 'number') kinds.add('number');
        else if (part === 'boolean') kinds.add('boolean');
        else if (/\[\]$/.test(part)) kinds.add('array');
        else kinds.add('object');
      }
      if (f[2] === '?') kinds.add('undefined');
      fields[f[1]] = { decl: f[3], kinds };
    }
    out[name] = fields;
  }
  return out;
}
const observed = {}; // "Iface.field" -> Set of observed type names
function observe(iface, obj, ctx) {
  if (!isObj(obj)) return;
  for (const [k, v] of Object.entries(obj)) {
    const key = `${iface}.${k}`;
    (observed[key] ||= { types: new Set(), ctx: new Set() }).types.add(tname(v));
    observed[key].ctx.add(ctx);
  }
}

// =====================================================================================================================
async function partN() {
  httpDir = path.join(OUT, 'http'); fs.mkdirSync(httpDir, { recursive: true });
  fs.mkdirSync(path.join(OUT, 'n6'), { recursive: true });
  const order = [];
  const BOB = 'c15_bob', AMY = 'c15_amy';
  const emails = [`${BOB}@contract15.test`, `${AMY}@contract15.test`];

  // 1. setup
  order.push('setup');
  const bob = await signup(BOB, emails[0], 'Bob Fifteen');
  const amy = await signup(AMY, emails[1], 'Amy Fifteen');
  const col = await seedPublishedCollection(bob, 'c15-bob-collection');
  const me = async (tok, label) => http(label, 'GET', '/api/users/me', { token: tok });
  const pub = async (u, label) => http(label, 'GET', `/api/public/creators/${u}`);

  // 2. N1
  order.push('N1');
  const n1 = await me(bob.token, 'N1-me');
  const j1 = n1.json;
  P('N1.1', n1.status === 200 && keysExactly(j1, ['user', 'profile']), `status=${n1.status} keys=${isObj(j1) ? Object.keys(j1).join(',') : tname(j1)}`);
  const u1 = isObj(j1) ? j1.user : undefined;
  const ufields = ['id', 'name', 'email', 'role', 'createdAt'];
  P('N1.2', isObj(u1) && typeof u1.username === 'string' && u1.username === BOB && ufields.every((k) => k in u1),
    `username=${JSON.stringify(u1?.username)} ` + ufields.map((k) => `${k}:${isObj(u1) && k in u1 ? tname(u1[k]) : 'MISSING'}`).join(' '));
  const pr1 = isObj(j1) ? j1.profile : undefined;
  const profileShape = (p) => keysExactly(p, ['displayName', 'bio', 'avatarUrl', 'bannerUrl', 'socialLinks', 'visibility'])
    && typeof p.displayName === 'string' && typeof p.bio === 'string'
    && (p.avatarUrl === null || typeof p.avatarUrl === 'string') && (p.bannerUrl === null || typeof p.bannerUrl === 'string')
    && strValues(p.socialLinks) && ['PUBLIC', 'PRIVATE'].includes(p.visibility);
  P('N1.3', profileShape(pr1), `profile=${JSON.stringify(pr1)}`);
  observe('Profile', pr1, 'new user');

  // 3. N5 before
  order.push('N5-before');
  const n5b = await pub(BOB, 'N5-before');

  // 4. N2
  order.push('N2');
  const six = (o) => ({ displayName: o.displayName, bio: o.bio, avatarUrl: o.avatarUrl, bannerUrl: o.bannerUrl, socialLinks: o.socialLinks, visibility: o.visibility });
  const priv = six({ displayName: 'Bob C15', bio: 'Bob writes contract tests.', avatarUrl: 'https://img.example.com/c15/bob-avatar.png',
    bannerUrl: 'https://img.example.com/c15/bob-banner.png', socialLinks: { site: 'https://bob.example.com', code: 'https://code.example.com/bob' }, visibility: 'PRIVATE' });
  const n21 = await http('N2.1-put', 'PUT', '/api/users/me/profile', { token: bob.token, body: priv });
  P('N2.1', n21.status === 200, `status=${n21.status}`);
  P('N2.2', keysExactly(n21.json, Object.keys(priv)) && deq(six(n21.json), priv), `response=${n21.text.slice(0, 400)}`);
  const n23 = await me(bob.token, 'N2.3-me');
  P('N2.3', n23.status === 200 && deq(six(n23.json?.profile || {}), priv) && keysExactly(n23.json?.profile, Object.keys(priv)) && deq(n23.json?.user, u1),
    `profile=${JSON.stringify(n23.json?.profile)} userUnchanged=${deq(n23.json?.user, u1)}`);
  observe('Profile', n23.json?.profile, 'round-trip');
  const cleared = { ...priv, avatarUrl: null, bannerUrl: null, socialLinks: {} };
  const n24p = await http('N2.4-put', 'PUT', '/api/users/me/profile', { token: bob.token, body: cleared });
  const n24 = await me(bob.token, 'N2.4-me');
  const p24 = n24.json?.profile;
  P('N2.4', n24p.status === 200 && isObj(p24) && p24.avatarUrl === null && p24.bannerUrl === null && deq(p24.socialLinks, {}),
    `put=${n24p.status} avatarUrl=${JSON.stringify(p24?.avatarUrl)} bannerUrl=${JSON.stringify(p24?.bannerUrl)} socialLinks=${JSON.stringify(p24?.socialLinks)}`);
  observe('Profile', p24, 'cleared');

  // 5. N3.1 (stored PRIVATE)
  order.push('N3.1');
  const pre31 = await me(bob.token, 'N3.1-precondition-me');
  if (pre31.json?.profile?.visibility !== 'PRIVATE') {
    P('N3.1', false, `precondition: stored visibility is ${JSON.stringify(pre31.json?.profile?.visibility)}, not PRIVATE`);
  } else {
    const n31 = await http('N3.1-put', 'PUT', '/api/users/me/profile', { token: bob.token, body: { ...cleared, visibility: null } });
    const g31 = await me(bob.token, 'N3.1-me');
    P('N3.1', n31.status === 200 && n31.json?.visibility === 'PRIVATE' && g31.json?.profile?.visibility === 'PRIVATE',
      `status=${n31.status} response=${JSON.stringify(n31.json?.visibility)} get=${JSON.stringify(g31.json?.profile?.visibility)}`);
  }

  // 6. explicit reset to PUBLIC, 7. N3.2 (stored PUBLIC)
  order.push('reset-PUBLIC', 'N3.2');
  const pubBody = { ...priv, visibility: 'PUBLIC' };
  const rs = await http('N3.2-reset-put', 'PUT', '/api/users/me/profile', { token: bob.token, body: pubBody });
  const rsg = await me(bob.token, 'N3.2-reset-me');
  if (rs.status !== 200 || rsg.json?.profile?.visibility !== 'PUBLIC') {
    P('N3.2', false, `(reset to PUBLIC failed) put=${rs.status} get=${JSON.stringify(rsg.json?.profile?.visibility)}`);
  } else {
    const n32 = await http('N3.2-put', 'PUT', '/api/users/me/profile', { token: bob.token, body: { ...pubBody, visibility: null } });
    const g32 = await me(bob.token, 'N3.2-me');
    P('N3.2', n32.status === 200 && n32.json?.visibility === 'PUBLIC' && g32.json?.profile?.visibility === 'PUBLIC',
      `status=${n32.status} response=${JSON.stringify(n32.json?.visibility)} get=${JSON.stringify(g32.json?.profile?.visibility)}`);
  }

  // 8. N5 after
  order.push('N5-after');
  const n5a = await pub(BOB, 'N5-after');
  const CKEYS = ['username', 'displayName', 'bio', 'avatarUrl', 'bannerUrl', 'socialLinks', 'joinedAt'];
  const b = n5b.json, a = n5a.json;
  P('N5.1', n5b.status === 200 && n5a.status === 200 && keysExactly(b, CKEYS) && keysExactly(a, CKEYS),
    `before=${n5b.status} after=${n5a.status} keysBefore=${isObj(b) ? Object.keys(b).join(',') : tname(b)} keysAfter=${isObj(a) ? Object.keys(a).join(',') : tname(a)}`);
  const both = (f) => [b, a].every((x) => isObj(x) && f(x));
  P('N5.1a', both((x) => typeof x.username === 'string' && x.username === BOB), `before=${JSON.stringify(b?.username)} after=${JSON.stringify(a?.username)}`);
  P('N5.1b', both((x) => typeof x.displayName === 'string'), `before=${JSON.stringify(b?.displayName)} after=${JSON.stringify(a?.displayName)}`);
  P('N5.1c', both((x) => typeof x.bio === 'string') && b?.bio === '', `before=${JSON.stringify(b?.bio)} (empty case) after=${JSON.stringify(a?.bio)}`);
  P('N5.1d', isObj(b) && b.avatarUrl === null && isObj(a) && isHttps(a.avatarUrl), `before=${JSON.stringify(b?.avatarUrl)} after=${JSON.stringify(a?.avatarUrl)}`);
  P('N5.1e', isObj(b) && b.bannerUrl === null && isObj(a) && isHttps(a.bannerUrl), `before=${JSON.stringify(b?.bannerUrl)} after=${JSON.stringify(a?.bannerUrl)}`);
  P('N5.1f', isObj(b) && strValues(b.socialLinks) && Object.keys(b.socialLinks).length === 0 && isObj(a) && strValues(a.socialLinks) && Object.keys(a.socialLinks).length === 2,
    `before=${JSON.stringify(b?.socialLinks)} after=${JSON.stringify(a?.socialLinks)}`);
  const iso = (x) => typeof x === N51G_TYPE && x !== null && Number.isFinite(Date.parse(x)) && new Date(x).getTime() === Date.parse(x) && new Date(new Date(x).toISOString()).getTime() === Date.parse(x);
  P('N5.1g', both((x) => iso(x.joinedAt)), `expectedType=${N51G_TYPE} before=${JSON.stringify(b?.joinedAt)} after=${JSON.stringify(a?.joinedAt)}`);
  observe('PublicCreator', b, 'N5 before'); observe('PublicCreator', a, 'N5 after');
  const noLeak = (r) => !hasKeyDeep(r.json, ['email', 'id', 'visibility']) && !containsAny(r.text, emails);
  P('N5.2', noLeak(n5b) && noLeak(n5a), `before=${noLeak(n5b)} after=${noLeak(n5a)}`);
  const n53 = await pub(BOB.toUpperCase(), 'N5.3-uppercase');
  INFO('N5.3', `GET /api/public/creators/${BOB.toUpperCase()} -> ${n53.status}${n53.status === 200 ? ` username=${JSON.stringify(n53.json?.username)}` : ''} (recorded only)`);

  // 9. N4
  order.push('N4');
  const valid = { ...pubBody };
  const extras = [['N4.1', { username: 'c15_other' }], ['N4.2', { role: 'ADMIN' }], ['N4.3', { email: 'c15_other@contract15.test' }], ['N4.4', { status: 'SUSPENDED' }]];
  for (const [id, extra] of extras) {
    const before = await me(bob.token, `${id}-before-me`);
    const pubBefore = id === 'N4.4' ? await pub(BOB, `${id}-before-public`) : null;
    const r = await http(`${id}-put`, 'PUT', '/api/users/me/profile', { token: bob.token, body: { ...valid, ...extra } });
    const after = await me(bob.token, `${id}-after-me`);
    let ok = r.status === 400 && isObj(r.json) && typeof r.json.error === 'string'
      && deq(after.json?.user, before.json?.user) && deq(after.json?.profile, before.json?.profile);
    let detail = `status=${r.status} error=${JSON.stringify(r.json?.error)} userUnchanged=${deq(after.json?.user, before.json?.user)} profileUnchanged=${deq(after.json?.profile, before.json?.profile)}`;
    if (pubBefore) {
      const pubAfter = await pub(BOB, `${id}-after-public`);
      const same = pubAfter.status === pubBefore.status && pubAfter.text === pubBefore.text;
      ok = ok && same; detail += ` publicUnchanged=${same} (${pubBefore.status}->${pubAfter.status})`;
    }
    P(id, ok, detail);
  }

  // N6
  order.push('N6');
  const amyMe = await me(amy.token, 'N6-amy-me');
  const ap = amyMe.json?.profile;
  const amyPriv = await http('N6-amy-private-put', 'PUT', '/api/users/me/profile', { token: amy.token,
    body: { displayName: ap?.displayName ?? 'Amy Fifteen', bio: ap?.bio ?? '', avatarUrl: null, bannerUrl: null, socialLinks: {}, visibility: 'PRIVATE' } });
  if (amyPriv.status !== 200) throw new Error(`setup step N6 amy PRIVATE -> ${amyPriv.status}`);
  const n61 = await pub(AMY, 'N6.1-private');
  const n62 = await pub('c15_nobody_zz', 'N6.2-unknown');
  P('N6.1', n61.status === 404, `status=${n61.status}`);
  P('N6.2', n62.status === 404, `status=${n62.status}`);
  const nd = path.join(OUT, 'n6');
  fs.writeFileSync(path.join(nd, 'private.body'), n61.buf); fs.writeFileSync(path.join(nd, 'private.content-type'), String(n61.ct));
  fs.writeFileSync(path.join(nd, 'unknown.body'), n62.buf); fs.writeFileSync(path.join(nd, 'unknown.content-type'), String(n62.ct));
  P('N6.3', Buffer.compare(n61.buf, n62.buf) === 0 && n61.ct === n62.ct,
    `bodyIdentical=${Buffer.compare(n61.buf, n62.buf) === 0} contentType=${JSON.stringify(n61.ct)} vs ${JSON.stringify(n62.ct)} body=${n61.text.slice(0, 200)}`);

  // N7
  order.push('N7');
  const n7 = await http('N7-collections', 'GET', `/api/public/collections?creator=${BOB}`);
  const j7 = n7.json;
  P('N7.1', n7.status === 200 && keysExactly(j7, ['items', 'page', 'size', 'totalItems', 'totalPages']),
    `status=${n7.status} keys=${isObj(j7) ? Object.keys(j7).join(',') : tname(j7)}`);
  const items = Array.isArray(j7?.items) ? j7.items : [];
  const IK = ['slug', 'title', 'description', 'coverUrl', 'coverThumbUrl', 'category', 'creator', 'moduleCount', 'pageCount'];
  const mine = items.find((x) => x?.slug === col.slug);
  const allI = (f) => items.length > 0 && !!mine && items.every((x) => isObj(x) && f(x));
  P('N7.2', allI((x) => keysExactly(x, IK)), `items=${items.length} seeded=${!!mine} keys=${items.map((x) => isObj(x) ? Object.keys(x).join(',') : tname(x)).join(' | ')}`);
  P('N7.2a', allI((x) => ['slug', 'title', 'description'].every((k) => typeof x[k] === 'string')), items.map((x) => `slug=${tname(x?.slug)} title=${tname(x?.title)} description=${tname(x?.description)}`).join(' | '));
  P('N7.2b', allI((x) => [x.coverUrl, x.coverThumbUrl].every((v) => v === null || typeof v === 'string')) && mine?.coverUrl === null && mine?.coverThumbUrl === null,
    `coverUrl=${JSON.stringify(mine?.coverUrl)} coverThumbUrl=${JSON.stringify(mine?.coverThumbUrl)}`);
  P('N7.2c', isObj(mine?.category) && keysExactly(mine.category, ['slug', 'name']) && typeof mine.category.slug === 'string' && typeof mine.category.name === 'string'
    && mine.category.slug === col.category.slug, `category=${JSON.stringify(mine?.category)} expected=${JSON.stringify(col.category)}`);
  P('N7.2d', allI((x) => keysExactly(x.creator, ['username', 'displayName']) && x.creator.username === BOB && typeof x.creator.displayName === 'string'),
    `creator=${JSON.stringify(mine?.creator)}`);
  P('N7.2e', allI((x) => Number.isInteger(x.moduleCount) && x.moduleCount >= 0 && Number.isInteger(x.pageCount) && x.pageCount >= 0),
    `moduleCount=${JSON.stringify(mine?.moduleCount)} pageCount=${JSON.stringify(mine?.pageCount)}`);
  P('N7.2f', isObj(j7) && ['page', 'size', 'totalItems', 'totalPages'].every((k) => Number.isInteger(j7[k])) && Array.isArray(j7.items),
    `page=${JSON.stringify(j7?.page)} size=${JSON.stringify(j7?.size)} totalItems=${JSON.stringify(j7?.totalItems)} totalPages=${JSON.stringify(j7?.totalPages)} items=${tname(j7?.items)}`);
  observe('Paged', j7, 'N7');
  for (const x of items) { observe('PublicCollectionSummary', x, 'N7'); observe('PublicCategoryRef', x?.category, 'N7'); observe('PublicCreatorRef', x?.creator, 'N7'); }
  P('N7.3', !containsAny(n7.text, emails), 'no seeded email in the collections response');

  // N8
  const leaks = publicTexts.filter((t) => containsAny(t.text, emails)).map((t) => t.label);
  P('N8', leaks.length === 0, `public responses checked=${publicTexts.length} leaking=${leaks.join(',') || 'none'}`);

  // N1.4: observed nullability vs types.ts (reported, never fixed)
  const decl = tsDecls();
  const nl = ['# Step 15d-1 nullability (observed vs src/lib/types.ts). Mismatches are reported, never fixed.',
    '# field | observed types | types.ts declaration | contexts | result'];
  const mism = [];
  for (const [iface, fields] of Object.entries(decl)) {
    for (const [f, d] of Object.entries(fields)) {
      const o = observed[`${iface}.${f}`];
      if (!o) { nl.push(`${iface}.${f} | (not observed) | ${d.decl} | - | not observed`); continue; }
      const bad = [...o.types].filter((t) => !d.kinds.has(t));
      const res = bad.length ? `MISMATCH (observed ${bad.join(',')} not declared)` : 'match';
      if (bad.length) mism.push(`${iface}.${f}`);
      nl.push(`${iface}.${f} | ${[...o.types].sort().join(',')} | ${d.decl} | ${[...o.ctx].join('; ')} | ${res}`);
    }
  }
  for (const k of Object.keys(observed)) {
    const [iface, f] = k.split('.');
    if (decl[iface] && !decl[iface][f]) { mism.push(k); nl.push(`${k} | ${[...observed[k].types].join(',')} | (not declared) | ${[...observed[k].ctx].join('; ')} | MISMATCH (undeclared field)`); }
  }
  nl.push(`N7.2c note: types.ts declares category as "PublicCategoryRef | null"; for the seeded collection (created with a category) null does not pass.`);
  fs.writeFileSync(path.join(OUT, 'nullability.txt'), nl.join('\n') + '\n');
  P('N1.4', mism.length === 0, `mismatches=${mism.join(',') || 'none'} (see nullability.txt)`);
  INFO('ORDER', order.join(' > '));
  return 'N';
}

// =====================================================================================================================
async function partSSetup() {
  const sd = path.join(OUT, 'setup');
  if (fs.existsSync(sd)) usage(`${sd} already exists; setup refuses to run`);
  httpDir = path.join(sd, 'http'); fs.mkdirSync(httpDir, { recursive: true });
  const SUS = 'c15_sus', PRIV = 'c15_priv';
  const emails = { [SUS]: `${SUS}@contract15.test`, [PRIV]: `${PRIV}@contract15.test` };
  const sus = await signup(SUS, emails[SUS], 'Sus Fifteen');
  const col = await seedPublishedCollection(sus, 'c15-sus-collection');
  const priv = await signup(PRIV, emails[PRIV], 'Priv Fifteen');
  const pm = await must('priv-private-put', 'PUT', '/api/users/me/profile', { token: priv.token,
    body: { displayName: 'Priv Fifteen', bio: '', avatarUrl: null, bannerUrl: null, socialLinks: {}, visibility: 'PRIVATE' } }, 200);
  if (pm.visibility !== 'PRIVATE') throw new Error('c15_priv not PRIVATE after setup');
  const s0 = await http('S0-sus-public', 'GET', `/api/public/creators/${SUS}`);
  P('S0', s0.status === 200, `GET /api/public/creators/${SUS} -> ${s0.status}`);
  fs.writeFileSync(path.join(sd, 'state.json'), JSON.stringify({ usernames: { suspended: SUS, private: PRIV }, emails: Object.values(emails), collectionSlug: col.slug }, null, 2) + '\n');
  return 'S';
}

async function partSAssert() {
  const sd = path.join(OUT, 'setup'), ad = path.join(OUT, 'assert');
  if (fs.existsSync(ad)) usage(`${ad} already exists; assert refuses to run`);
  const st = JSON.parse(fs.readFileSync(path.join(sd, 'state.json'), 'utf8'));
  const n6 = path.resolve(A.n6);
  const n6body = fs.readFileSync(path.join(n6, 'private.body')), n6ct = fs.readFileSync(path.join(n6, 'private.content-type'), 'utf8');
  const n6ubody = fs.readFileSync(path.join(n6, 'unknown.body')), n6uct = fs.readFileSync(path.join(n6, 'unknown.content-type'), 'utf8');
  httpDir = path.join(ad, 'http'); fs.mkdirSync(httpDir, { recursive: true });
  const SUS = st.usernames.suspended, PRIV = st.usernames.private;
  const s1 = await http('S1-sus-public', 'GET', `/api/public/creators/${SUS}`);
  P('S1', s1.status === 404, `GET /api/public/creators/${SUS} -> ${s1.status}`);
  const pv = await http('S2-priv-public', 'GET', `/api/public/creators/${PRIV}`);
  const un = await http('S2-unknown-public', 'GET', '/api/public/creators/c15_nobody_zz');
  const same = (r) => Buffer.compare(s1.buf, r.buf) === 0 && s1.ct === r.ct;
  const sameN6 = Buffer.compare(s1.buf, n6body) === 0 && s1.ct === n6ct && Buffer.compare(s1.buf, n6ubody) === 0 && s1.ct === n6uct;
  P('S2', pv.status === 404 && un.status === 404 && same(pv) && same(un) && sameN6,
    `priv=${pv.status}/${same(pv)} unknown=${un.status}/${same(un)} n6=${sameN6} contentType=${JSON.stringify(s1.ct)}`);
  const s3 = await http('S3-sus-collections', 'GET', `/api/public/collections?creator=${SUS}`);
  P('S3', s3.status === 200 && Array.isArray(s3.json?.items) && s3.json.items.length === 0 && s3.json.totalItems === 0 && !containsAny(s3.text, st.emails),
    `status=${s3.status} items=${JSON.stringify(s3.json?.items)} totalItems=${JSON.stringify(s3.json?.totalItems)}`);
  // S4: every public response of part S (setup and assert) is checked for a seeded email
  const setupPublic = fs.readdirSync(path.join(sd, 'http')).map((f) => JSON.parse(fs.readFileSync(path.join(sd, 'http', f), 'utf8')))
    .filter((r) => r.request.path.startsWith('/api/public/')).map((r) => ({ label: `setup:${r.label}`, text: r.response.body }));
  const all = [...setupPublic, ...publicTexts];
  const leaks = all.filter((t) => containsAny(t.text, st.emails)).map((t) => t.label);
  P('S4', leaks.length === 0, `public responses checked=${all.length} leaking=${leaks.join(',') || 'none'}`);
  return 'S';
}

try {
  fs.mkdirSync(OUT, { recursive: true });
  let part;
  if (A.part === 'N') part = await partN();
  else if (A.phase === 'setup') part = await partSSetup();
  else part = await partSAssert();
  say(`SUMMARY part=${part} phase=${A.phase ?? '-'} pass=${pass} fail=${fail}`);
  process.exit(fail === 0 ? 0 : 1);
} catch (e) {
  console.error(`CRASH ${e && e.stack ? e.stack : e}`);
  process.exit(3);
}
