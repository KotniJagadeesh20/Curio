// 14e-1 S5 (approved C1): resolve the collection + page that t2-editor.mjs created in THIS run (fresh backend),
// replacing the ids 586 / 23 that the original 13e scripts hardcode. No content is created here.
// Fails loudly (exit 1) when the fixture can't be found; it never substitutes other content.
export async function resolveFixture(page) {
  const get = (p) => page.evaluate(async (p) => { const r = await fetch('/api' + p, { headers: { Authorization: 'Bearer ' + localStorage.getItem('auth_token') } }); return { status: r.status, body: await r.json().catch(() => null) }; }, p);
  const fail = (msg) => { console.log('FIXTURE NOT FOUND  ' + msg); process.exit(1); };
  const mine = await get('/collections/mine');
  if (mine.status !== 200 || !Array.isArray(mine.body)) fail(`GET /api/collections/mine -> ${mine.status}`);
  const matches = mine.body.filter(c => /^Editor accept \d+$/.test(c.title ?? ''));
  if (matches.length !== 1) fail(`expected exactly 1 "Editor accept <n>" collection from this run's t2, found ${matches.length}: ${JSON.stringify(matches.map(c => [c.id, c.title]))}`);
  const COLL = matches[0].id;
  const det = await get(`/collections/${COLL}`);
  const first = det.body?.modules?.[0]?.pages?.[0];
  if (det.status !== 200 || !first) fail(`collection ${COLL}: status ${det.status}, no first page`);
  if (det.body.modules[0].title !== 'Module A' || first.title !== 'Page One') fail(`collection ${COLL}: first module/page is "${det.body.modules[0].title}"/"${first.title}", expected "Module A"/"Page One" (t2)`);
  const PAGE = first.id;
  console.log(`FIXTURE  collection ${COLL} "${matches[0].title}" · page ${PAGE} "${first.title}" (created by t2-editor in this run)`);
  return { COLL, PAGE };
}
