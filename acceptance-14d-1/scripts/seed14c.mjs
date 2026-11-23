// Step 14c browser-acceptance content, created through the creator API (fresh in-memory H2 backend).
// Scenario A (technical): rich text, code, SVG, table with header + caption, sandboxed HTML.
// Scenario B (travel): uploaded images (with dimensions), a YouTube video, info/tip/warning callouts.
// Pages across two modules, one draft page; plus an unlisted collection, a draft collection and a deleted collection.
import fs from 'fs';
import zlib from 'zlib';
const B = 'http://localhost:8081/api';
const login = async (email, password) => (await (await fetch(B + '/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, password }) })).json()).token;
const token = await login('admin@codemastery.local', 'ChangeMe123!');
const H = { Authorization: 'Bearer ' + token };
const call = async (m, p, b) => {
  const r = await fetch(B + p, { method: m, headers: { ...H, 'content-type': 'application/json' }, body: b ? JSON.stringify(b) : undefined });
  const t = await r.text(); if (!r.ok) throw new Error(`${m} ${p} ${r.status} ${t}`); return t ? JSON.parse(t) : null;
};

// A real PNG of a given size (solid colour), so the browser can decode it and report naturalWidth.
function png(w, h, [r, g, b]) {
  const crcT = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  const crc = (buf) => { let c = 0xffffffff; for (const x of buf) c = crcT[(c ^ x) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([len, td, c]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  const row = Buffer.concat([Buffer.from([0]), Buffer.from(Array.from({ length: w }, () => [r, g, b]).flat())]);
  const raw = Buffer.concat(Array.from({ length: h }, () => row));
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}
const upload = async (name, buf) => {
  const fd = new FormData(); fd.append('file', new Blob([buf], { type: 'image/png' }), name);
  const r = await fetch(B + '/media', { method: 'POST', headers: H, body: fd }); if (!r.ok) throw new Error('upload ' + r.status + ' ' + await r.text());
  return (await r.json()).id;
};
const tramImg = await upload('tram.png', png(640, 400, [200, 60, 40]));
const tileImg = await upload('tiles.png', png(300, 300, [30, 90, 200]));

const page = async (m, title, slug, summary, blocks, publish = true) => {
  const p = await call('POST', `/modules/${m.id}/pages`, { title, slug, summary, blocks });
  if (publish) await call('POST', `/pages/${p.id}/publish`);
  return p;
};
const collection = async (title, slug, description) => call('POST', '/collections', { title, slug, description, categoryId: 2 });

// ---- Scenario B: travel (lisbon) -------------------------------------------------------------------------------------
const lis = await collection('Lisbon in 3 days', 'lisbon', 'Trams, tiles and pastéis.');
const d1 = await call('POST', `/collections/${lis.id}/modules`, { title: 'Day one', slug: 'day-one' });
const d2 = await call('POST', `/collections/${lis.id}/modules`, { title: 'Day two', slug: 'day-two' });
const arrival = await page(d1, 'Arrival', 'arrival', 'Airport to Alfama', [
  { id: 'h', type: 'heading', level: 2, text: 'Getting into town' },
  { id: 'i1', type: 'image', url: '', caption: 'Tram 28 in Alfama', assetId: tramImg },
  { id: 'c1', type: 'callout', variant: 'info', text: 'The metro runs from the airport to the centre in about 20 minutes.' },
  { id: 'c2', type: 'callout', variant: 'tip', text: 'Buy a rechargeable Viva Viagem card.' },
  { id: 'c3', type: 'callout', variant: 'warning', text: 'Watch for pickpockets on Tram 28.' },
]);
await page(d1, 'Tram 28', 'tram-28', '', [
  { id: 'v', type: 'video', url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', caption: 'A ride on Tram 28' },
  { id: 'i2', type: 'image', url: '', caption: 'Azulejos', assetId: tileImg },
]);
await page(d1, 'Secret draft page', 'secret-draft', '', [{ id: 't', type: 'text', text: 'Not published' }], false);
await page(d2, 'Belém', 'belem', 'Tower and pastéis', [{ id: 't', type: 'text', text: 'Pastéis de Belém since 1837.' }]);
await call('POST', `/collections/${lis.id}/publish`, { status: 'PUBLISHED' });

// ---- Scenario A: technical (java) ------------------------------------------------------------------------------------
const java = await collection('Java essentials', 'java-essentials', 'Core Java, step by step.');
const basics = await call('POST', `/collections/${java.id}/modules`, { title: 'Basics', slug: 'basics' });
const coll = await call('POST', `/collections/${java.id}/modules`, { title: 'Collections', slug: 'collections' });
const doc = [
  { type: 'paragraph', children: [{ text: 'Java is ' }, { text: 'statically typed', bold: true }, { text: ' and ' }, { text: 'garbage collected', italic: true }, { text: '. See the ' }, { text: 'docs', href: 'https://docs.oracle.com/javase/tutorial/' }, { text: '.' }] },
  { type: 'list', ordered: false, items: [[{ text: 'Write once' }], [{ text: 'Run anywhere' }]] },
];
// the server checks that `text` is the doc's plain-text projection (richText.projectDoc: nodes joined by a blank line)
const richText = 'Java is statically typed and garbage collected. See the docs (https://docs.oracle.com/javase/tutorial/).\n\n- Write once\n- Run anywhere';
await page(basics, 'Hello, Java', 'hello-java', 'Your first program', [
  { id: 't', type: 'text', text: richText, doc },
  { id: 'code', type: 'code', language: 'java', code: 'public class Hello {\n  public static void main(String[] a) {\n    System.out.println("Hi");\n  }\n}', caption: 'Hello.java' },
  { id: 'svg', type: 'svg', svg: '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="60"><rect width="200" height="60" fill="#4a90d9"/><text x="20" y="38" fill="white">JVM</text></svg>', caption: 'The JVM' },
]);
await page(coll, 'Lists and maps', 'lists-and-maps', '', [
  { id: 'tb', type: 'table', hasHeader: true, caption: 'Common collections', rows: [['Type', 'Ordered', 'Duplicates'], ['ArrayList', 'yes', 'yes'], ['HashSet', 'no', 'no'], ['TreeMap', 'by key', 'keys: no']] },
  { id: 'html', type: 'html', html: '<style>p{color:#c33;font:16px sans-serif}</style><p>Sandboxed HTML block</p>', height: 120 },
]);
await call('POST', `/collections/${java.id}/publish`, { status: 'PUBLISHED' });

// ---- unlisted, draft and deleted collections --------------------------------------------------------------------------
const un = await collection('Secret family recipe', 'secret-recipe', 'By link only.');
const unm = await call('POST', `/collections/${un.id}/modules`, { title: 'Dough', slug: 'dough' });
await page(unm, 'Mixing', 'mixing', '', [{ id: 't', type: 'text', text: 'Flour, water, salt.' }]);
await page(unm, 'Resting', 'resting', '', [{ id: 't', type: 'text', text: 'Rest overnight.' }]);
await call('POST', `/collections/${un.id}/publish`, { status: 'UNLISTED' });

const dr = await collection('Draft trip', 'draft-trip', 'Not yet.');
const drm = await call('POST', `/collections/${dr.id}/modules`, { title: 'Plan', slug: 'plan' });
await page(drm, 'Ideas', 'ideas', '', [{ id: 't', type: 'text', text: 'Published page inside a draft collection' }]);

const os = await collection('Oslo on a budget', 'oslo', 'Deleted.');
const osm = await call('POST', `/collections/${os.id}/modules`, { title: 'Day', slug: 'day' });
await page(osm, 'Fjord', 'fjord', '', [{ id: 't', type: 'text', text: 'Deleted collection page' }]);
await call('POST', `/collections/${os.id}/publish`, { status: 'PUBLISHED' });
await call('DELETE', `/collections/${os.id}`);

// stale-cache target: a published page that the test unpublishes later
const st = await collection('Porto by tram', 'porto', 'Stale-cache target.');
const stm = await call('POST', `/collections/${st.id}/modules`, { title: 'Day one', slug: 'day-one' });
const cellars = await page(stm, 'Port cellars', 'cellars', '', [{ id: 't', type: 'text', text: 'Vila Nova de Gaia' }]);
await page(stm, 'Ribeira', 'ribeira', '', [{ id: 't', type: 'text', text: 'Riverside' }]);
await call('POST', `/collections/${st.id}/publish`, { status: 'PUBLISHED' });

// 14c review fix: a collection whose middle page is unpublished between two visits (outline revalidation)
const br = await collection('Braga weekend', 'braga', 'Outline revalidation target.');
const brm = await call('POST', `/collections/${br.id}/modules`, { title: 'Weekend', slug: 'weekend' });
await page(brm, 'Saturday', 'saturday', '', [{ id: 't', type: 'text', text: 'Bom Jesus' }]);
const braSunday = await page(brm, 'Sunday', 'sunday', '', [{ id: 't', type: 'text', text: 'Old town' }]);
await page(brm, 'Monday', 'monday', '', [{ id: 't', type: 'text', text: 'Home' }]);
await call('POST', `/collections/${br.id}/publish`, { status: 'PUBLISHED' });

// a non-admin reader account for the "valid token" session
const reg = await fetch(B + '/auth/register', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'Reader', email: 'reader14c@example.com', password: 'Reader12345!', username: 'reader14c' }) });
const readerToken = reg.ok ? (await reg.json()).token : null;

const out = { token, readerToken, lisbon: lis.id, arrivalPage: arrival.id, cellarsPage: cellars.id, sundayPage: braSunday.id, tramImg, tileImg };
fs.writeFileSync(new URL('./seed14c.json', import.meta.url), JSON.stringify(out, null, 2));
console.log(JSON.stringify(out));
