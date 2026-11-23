// Step 14d-3 browser content, added after seed14c.mjs: a "Long read" collection whose pages are long enough to scroll.
//   part/one   : an UPLOADED image at the top (the API gives width/height), then 30 paragraphs
//   part/two   : an EXTERNAL image without dimensions at the top (https://images.example.org/…, served by the test), then 30 paragraphs
//   part/three : 30 paragraphs
import fs from 'fs';
import zlib from 'zlib';
const B = 'http://localhost:8081/api';
const token = (await (await fetch(B + '/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'admin@codemastery.local', password: 'ChangeMe123!' }) })).json()).token;
const H = { Authorization: 'Bearer ' + token };
const call = async (m, p, b) => {
  const r = await fetch(B + p, { method: m, headers: { ...H, 'content-type': 'application/json' }, body: b ? JSON.stringify(b) : undefined });
  const t = await r.text(); if (!r.ok) throw new Error(`${m} ${p} ${r.status} ${t}`); return t ? JSON.parse(t) : null;
};
function png(w, h, [r, g, b]) {
  const crcT = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  const crc = (buf) => { let c = 0xffffffff; for (const x of buf) c = crcT[(c ^ x) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([len, td, c]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  const row = Buffer.concat([Buffer.from([0]), Buffer.from(Array.from({ length: w }, () => [r, g, b]).flat())]);
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(Buffer.concat(Array.from({ length: h }, () => row)))), chunk('IEND', Buffer.alloc(0))]);
}
const fd = new FormData(); fd.append('file', new Blob([png(600, 450, [40, 140, 90])]), 'hero.png');
const hero = (await (await fetch(B + '/media', { method: 'POST', headers: H, body: fd })).json()).id;

const para = (i) => ({ id: `t${i}`, type: 'text', text: `Paragraph ${i}. ` + 'Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. '.repeat(3) });
const paras = Array.from({ length: 30 }, (_, i) => para(i + 1));
const c = await call('POST', '/collections', { title: 'Long read', slug: 'long-read', description: 'Scroll restoration target.', categoryId: 2 });
const m = await call('POST', `/collections/${c.id}/modules`, { title: 'Part', slug: 'part' });
const page = async (title, slug, blocks) => { const p = await call('POST', `/modules/${m.id}/pages`, { title, slug, summary: '', blocks }); await call('POST', `/pages/${p.id}/publish`); return p; };
await page('One', 'one', [{ id: 'img', type: 'image', url: '', caption: 'Hero', assetId: hero }, ...paras]);
await page('Two', 'two', [{ id: 'img', type: 'image', url: 'https://images.example.org/late.png', caption: 'Late external image' }, ...paras]);
await page('Three', 'three', paras);
await call('POST', `/collections/${c.id}/publish`, { status: 'PUBLISHED' });
const out = { longRead: c.id, hero };
fs.writeFileSync(new URL('./seed14d3.json', import.meta.url), JSON.stringify(out, null, 2));
console.log(JSON.stringify(out));
