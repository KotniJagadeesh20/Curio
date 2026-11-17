const B = 'http://localhost:8081/api';
const login = await (await fetch(B + '/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'admin@codemastery.local', password: 'ChangeMe123!' }) })).json();
const H = { 'content-type': 'application/json', Authorization: 'Bearer ' + login.token };
const call = async (m, p, b) => { const r = await fetch(B + p, { method: m, headers: H, body: b ? JSON.stringify(b) : undefined }); const t = await r.text(); if (!r.ok) throw new Error(`${m} ${p} ${r.status} ${t}`); return t ? JSON.parse(t) : null; };
const mk = async (title, slug, categoryId, status) => {
  const c = await call('POST', '/collections', { title, slug, description: `${title}: a test collection for 14a.`, categoryId });
  const m = await call('POST', `/collections/${c.id}/modules`, { title: 'Day one', slug: 'day-one' });
  const p = await call('POST', `/modules/${m.id}/pages`, { title: 'Start', slug: 'start', summary: '', blocks: [{ id: 'a1', type: 'text', text: 'Hello' }] });
  await call('POST', `/pages/${p.id}/publish`);
  if (status) await call('POST', `/collections/${c.id}/publish`, { status });
};
await mk('Lisbon in 3 days', 'lisbon', 2, 'PUBLISHED');
await mk('Kyoto temples', 'kyoto', 2, 'PUBLISHED');
await mk('Oslo on a budget', 'oslo', 2, 'PUBLISHED');
await mk('Lima food walk', 'lima', 2, 'PUBLISHED');
await mk('Fresh pasta', 'pasta', 3, 'PUBLISHED');
await mk('Weeknight ramen', 'ramen', 3, 'PUBLISHED');
await mk('Secret family recipe', 'secret-recipe', 3, 'UNLISTED');
await mk('Draft trip notes', 'draft-trip', 2, null);
// expired token, signed with the dev secret
const crypto = await import('crypto');
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const head = b64({ alg: 'HS256' }), body = b64({ sub: '1', role: 'ADMIN', iat: 1700000000, exp: 1700003600 });
const sig = crypto.createHmac('sha256', 'dev-only-secret-change-me-dev-only-secret').update(head + '.' + body).digest('base64url');
console.log(JSON.stringify({ valid: login.token, expired: `${head}.${body}.${sig}` }));
