// Step 14e-2 seed (plan rev. 2 §2.1). Fresh in-memory H2 backend on :8081. Two non-admin creators, created through the API.
//   Creator A (anna_java):  "Java Learning" (Core Java: A1 rich text, A2 SVG, A3 code + table; plus a DRAFT page),
//                           "Java Drafts" (DRAFT collection with one published page), "Java Notes" (UNLISTED, one page).
//   Creator B (ben_travel): "Travel Experiences" (Lisbon: B1 image + callouts, B2 YouTube + image; Porto: B3 text + DRAFT page).
// Usernames are set at signup (SignupRequest.username); PUT /api/users/me/profile sets the display name (the profile DTO
// has no username field). Image blocks use the known working shape: `url` before `assetId` (plan §2.1, §7, §8).
// Usage: node seed14e.mjs   → writes ./seed14e.json and prints it as the last stdout line.
import fs from 'fs';
import zlib from 'zlib';
const B = 'http://localhost:8081/api';
const json = { 'content-type': 'application/json' };

async function call(token, m, p, b) {
  const r = await fetch(B + p, { method: m, headers: { Authorization: 'Bearer ' + token, ...json }, body: b ? JSON.stringify(b) : undefined });
  const t = await r.text(); if (!r.ok) throw new Error(`${m} ${p} → ${r.status} ${t}`); return t ? JSON.parse(t) : null;
}
async function signup(name, email, username, displayName) {
  const r = await fetch(B + '/auth/signup', { method: 'POST', headers: json, body: JSON.stringify({ name, email, password: 'Creator12345!', username }) });
  if (r.status !== 201) throw new Error(`signup ${email} → ${r.status} ${await r.text()}`);
  const { token, user } = await r.json();
  if (user.username !== username || user.role !== 'USER') throw new Error(`signup ${email}: got username=${user.username} role=${user.role}`);
  await call(token, 'PUT', '/users/me/profile', { displayName, bio: '', avatarUrl: null, bannerUrl: null, socialLinks: {}, visibility: null });
  return { token, id: user.id, username };
}

// A real PNG of a given size (solid colour), so the browser decodes it and reports naturalWidth (same generator as 14c/14d).
function png(w, h, [r, g, b]) {
  const crcT = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  const crc = (buf) => { let c = 0xffffffff; for (const x of buf) c = crcT[(c ^ x) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([len, td, c]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  const row = Buffer.concat([Buffer.from([0]), Buffer.from(Array.from({ length: w }, () => [r, g, b]).flat())]);
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(Buffer.concat(Array.from({ length: h }, () => row)))), chunk('IEND', Buffer.alloc(0))]);
}
async function upload(token, name, buf) {
  const fd = new FormData(); fd.append('file', new Blob([buf], { type: 'image/png' }), name);
  const r = await fetch(B + '/media', { method: 'POST', headers: { Authorization: 'Bearer ' + token }, body: fd });
  if (!r.ok) throw new Error(`upload ${name} → ${r.status} ${await r.text()}`);
  return (await r.json()).id;
}
const mkPage = async (token, mod, title, slug, summary, blocks, publish = true) => {
  const p = await call(token, 'POST', `/modules/${mod.id}/pages`, { title, slug, summary, blocks });
  if (publish) await call(token, 'POST', `/pages/${p.id}/publish`);
  return p;
};

const A = await signup('Anna Java', 'anna14e@example.com', 'anna_java', 'Anna');
const Bc = await signup('Ben Travel', 'ben14e@example.com', 'ben_travel', 'Ben');

// ---- Scenario A: "Java Learning" (creator A) -------------------------------------------------------------------------
const jl = await call(A.token, 'POST', '/collections', { title: 'Java Learning', slug: 'java-learning', description: 'Learn Java from the ground up.', categoryId: 1 });
const core = await call(A.token, 'POST', `/collections/${jl.id}/modules`, { title: 'Core Java', slug: 'core-java' });
const doc = [
  { type: 'paragraph', children: [{ text: 'Java is ' }, { text: 'strongly typed', bold: true }, { text: ' and ' }, { text: 'object oriented', italic: true }, { text: '. Read the ' }, { text: 'tutorial', href: 'https://dev.java/learn/' }, { text: '.' }] },
  { type: 'list', ordered: false, items: [[{ text: 'Install the JDK' }], [{ text: 'Write Hello.java' }], [{ text: 'Run it' }]] },
];
const richText = 'Java is strongly typed and object oriented. Read the tutorial (https://dev.java/learn/).\n\n- Install the JDK\n- Write Hello.java\n- Run it';
// a long plain-text block, so A1 is tall enough for the scroll-restoration checks (R4)
const longText = Array.from({ length: 40 }, (_, i) => `Paragraph ${i + 1}: the Java platform compiles source code to bytecode that runs on the JVM.`).join('\n\n');
const a1 = await mkPage(A.token, core, 'Hello, Java', 'hello-java', 'Your first Java program', [
  { id: 'a1t', type: 'text', text: richText, doc },
  { id: 'a1h', type: 'heading', level: 2, text: 'Background reading' },
  { id: 'a1l', type: 'text', text: longText },
]);
const SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="240" height="80"><rect width="240" height="80" fill="#e4572e"/><text x="24" y="48" fill="#ffffff">Bytecode</text></svg>';
const a2 = await mkPage(A.token, core, 'The JVM', 'the-jvm', 'How the virtual machine runs code', [
  { id: 'a2s', type: 'svg', svg: SVG, caption: 'Source to bytecode' },
  { id: 'a2t', type: 'text', text: 'The JVM loads, verifies and executes bytecode.' },
]);
const CODE = 'import java.util.*;\n\nList<String> names = new ArrayList<>();\nnames.add("Ada");\nMap<String, Integer> ages = new HashMap<>();';
const a3 = await mkPage(A.token, core, 'Collections', 'collections', 'Lists, sets and maps', [
  { id: 'a3c', type: 'code', language: 'java', code: CODE, caption: 'Collections.java' },
  { id: 'a3t', type: 'table', hasHeader: true, caption: 'Collection types', rows: [['Type', 'Ordered', 'Unique'], ['ArrayList', 'yes', 'no'], ['HashSet', 'no', 'yes'], ['TreeMap', 'by key', 'keys']] },
]);
const aDraft = await mkPage(A.token, core, 'Generics draft', 'generics-draft', 'Unfinished', [{ id: 't', type: 'text', text: 'Draft about generics.' }], false);
await call(A.token, 'POST', `/collections/${jl.id}/publish`, { status: 'PUBLISHED' });

// "Java Drafts": a DRAFT collection with one published page
const jd = await call(A.token, 'POST', '/collections', { title: 'Java Drafts', slug: 'java-drafts', description: 'Not ready yet.', categoryId: 1 });
const jdm = await call(A.token, 'POST', `/collections/${jd.id}/modules`, { title: 'Ideas', slug: 'ideas' });
const jdp = await mkPage(A.token, jdm, 'Streams idea', 'streams-idea', '', [{ id: 't', type: 'text', text: 'Published page inside a draft collection.' }]);

// "Java Notes": an UNLISTED collection with one published page
const jn = await call(A.token, 'POST', '/collections', { title: 'Java Notes', slug: 'java-notes', description: 'Personal notes, by link only.', categoryId: 1 });
const jnm = await call(A.token, 'POST', `/collections/${jn.id}/modules`, { title: 'Notes', slug: 'notes' });
const jnp = await mkPage(A.token, jnm, 'Records', 'records', '', [{ id: 't', type: 'text', text: 'Records are concise data carriers.' }]);
await call(A.token, 'POST', `/collections/${jn.id}/publish`, { status: 'UNLISTED' });

// ---- Scenario B: "Travel Experiences" (creator B) --------------------------------------------------------------------
const IMG1 = { w: 800, h: 450 }, IMG2 = { w: 600, h: 600 };
const img1 = await upload(Bc.token, 'lisbon.png', png(IMG1.w, IMG1.h, [30, 120, 200]));
const img2 = await upload(Bc.token, 'tram.png', png(IMG2.w, IMG2.h, [220, 180, 40]));
const te = await call(Bc.token, 'POST', '/collections', { title: 'Travel Experiences', slug: 'travel-experiences', description: 'Trips through Portugal.', categoryId: 2 });
const lis = await call(Bc.token, 'POST', `/collections/${te.id}/modules`, { title: 'Lisbon', slug: 'lisbon' });
const por = await call(Bc.token, 'POST', `/collections/${te.id}/modules`, { title: 'Porto', slug: 'porto' });
const b1 = await mkPage(Bc.token, lis, 'Arrival', 'arrival', 'Landing in Lisbon', [
  { id: 'b1i', type: 'image', url: '', assetId: img1, caption: 'Lisbon rooftops' },
  { id: 'b1c1', type: 'callout', variant: 'info', text: 'The airport metro reaches the centre in 20 minutes.' },
  { id: 'b1c2', type: 'callout', variant: 'tip', text: 'Buy a Viva Viagem card at the station.' },
  { id: 'b1c3', type: 'callout', variant: 'warning', text: 'Mind your bag on crowded trams.' },
]);
const b2 = await mkPage(Bc.token, lis, 'Tram 28', 'tram-28', 'The classic route', [
  { id: 'b2v', type: 'video', url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', caption: 'Riding Tram 28' },
  { id: 'b2i', type: 'image', url: '', assetId: img2, caption: 'Yellow tram' },
]);
const b3 = await mkPage(Bc.token, por, 'Ribeira', 'ribeira', 'By the river', [{ id: 'b3t', type: 'text', text: 'Ribeira is the riverside heart of Porto.' }]);
const bDraft = await mkPage(Bc.token, por, 'Port wine draft', 'port-wine-draft', 'Unfinished', [{ id: 't', type: 'text', text: 'Draft about port wine.' }], false);
await call(Bc.token, 'POST', `/collections/${te.id}/publish`, { status: 'PUBLISHED' });

const out = {
  aToken: A.token, bToken: Bc.token, aUser: A.username, bUser: Bc.username,
  ids: { javaLearning: jl.id, javaDrafts: jd.id, javaNotes: jn.id, travel: te.id, a1: a1.id, a2: a2.id, a3: a3.id, aDraft: aDraft.id, jdPage: jdp.id, jnPage: jnp.id, b1: b1.id, b2: b2.id, b3: b3.id, bDraft: bDraft.id },
  media: { img1, img2 }, sizes: { img1: IMG1, img2: IMG2 }, svg: SVG, code: CODE,
};
fs.writeFileSync(new URL('./seed14e.json', import.meta.url), JSON.stringify(out, null, 2));
console.log(JSON.stringify(out));
