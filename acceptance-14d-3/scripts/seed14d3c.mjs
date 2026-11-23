// Step 14d-3 correction round: content for t14d3c.mjs, run AFTER all other scripts (its own collection, so nothing that
// the earlier scripts count or navigate changes). "Embeds": page "Frames" has every iframe kind the renderer produces
// above 30 paragraphs (a YouTube and a Vimeo embed, an HTML block with an explicit height whose document is far taller,
// an HTML block without a height); page "After" follows it (Next / Back).
// Native-video correction: module "Media", page "Clip" (a native video block, https://videos.example.org/clip.webm,
// served by t14d3c.mjs, above 30 paragraphs) and page "Clip end" after it.
import fs from 'fs';
const B = 'http://localhost:8081/api';
const token = (await (await fetch(B + '/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'admin@codemastery.local', password: 'ChangeMe123!' }) })).json()).token;
const H = { Authorization: 'Bearer ' + token };
const call = async (m, p, b) => {
  const r = await fetch(B + p, { method: m, headers: { ...H, 'content-type': 'application/json' }, body: b ? JSON.stringify(b) : undefined });
  const t = await r.text(); if (!r.ok) throw new Error(`${m} ${p} ${r.status} ${t}`); return t ? JSON.parse(t) : null;
};
const para = (i) => ({ id: `t${i}`, type: 'text', text: `Paragraph ${i}. ` + 'Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. '.repeat(3) });
const paras = Array.from({ length: 30 }, (_, i) => para(i + 1));
const tall = '<div style="height:2400px;background:linear-gradient(#fde,#def)">A document much taller than its frame</div>';
const c = await call('POST', '/collections', { title: 'Embeds', slug: 'embeds', description: 'Iframe sizing target.', categoryId: 2 });
const m = await call('POST', `/collections/${c.id}/modules`, { title: 'Part', slug: 'part' });
const page = async (title, slug, blocks) => { const p = await call('POST', `/modules/${m.id}/pages`, { title, slug, summary: '', blocks }); await call('POST', `/pages/${p.id}/publish`); return p; };
await page('Frames', 'frames', [
  { id: 'yt', type: 'video', url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', caption: 'YouTube' },
  { id: 'vm', type: 'video', url: 'https://vimeo.com/76979871', caption: 'Vimeo' },
  { id: 'h1', type: 'html', html: tall, height: 300 },
  { id: 'h2', type: 'html', html: tall },
  ...paras,
]);
await page('After', 'after', paras.slice(0, 5));
const mv = await call('POST', `/collections/${c.id}/modules`, { title: 'Media', slug: 'media' });
const pageIn = async (mod, title, slug, blocks) => { const p = await call('POST', `/modules/${mod.id}/pages`, { title, slug, summary: '', blocks }); await call('POST', `/pages/${p.id}/publish`); return p; };
await pageIn(mv, 'Clip', 'clip', [{ id: 'vid', type: 'video', url: 'https://videos.example.org/clip.webm', caption: 'Native video' }, ...paras]);
await pageIn(mv, 'Clip end', 'clip-end', paras.slice(0, 5));
// NETWORK_EMPTY/NO_SOURCE correction: a native video whose source fails (404, served late by t14d3c.mjs C6b)
await pageIn(mv, 'Broken clip', 'broken-clip', [{ id: 'vid', type: 'video', url: 'https://videos.example.org/broken.webm', caption: 'Failing video' }, ...paras]);
await call('POST', `/collections/${c.id}/publish`, { status: 'PUBLISHED' });
const out = { embeds: c.id };
fs.writeFileSync(new URL('./seed14d3c.json', import.meta.url), JSON.stringify(out, null, 2));
console.log(JSON.stringify(out));
