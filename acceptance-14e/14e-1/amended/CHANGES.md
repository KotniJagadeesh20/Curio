# Amended 13e scripts (approved C1, 14e-1 resumed S5)

The originals in `acceptance-13e/scripts/` are unchanged; they stay byte-identical and are verified against `acceptance-14e/scripts/manifest.sha256` on every run.

**Change 1 (C1):** the hardcoded page `586` and collection `23` are replaced by the ids of the "Editor accept <n>" collection and its first page, "Page One". `t2-editor.mjs` created those **in the same fresh-backend run**, and `fixture.mjs` reads them from `GET /api/collections/mine` and `GET /api/collections/{id}`.

`fixture.mjs` exits 1 with `FIXTURE NOT FOUND` in any of these cases, and creates no content:
- zero matching collections, or more than one;
- the first module is not "Module A";
- the first page is not "Page One".

**Change 2 (approved F4 correction, t4 only):** line 58's collection lookup uses `/api/collections/mine` (the app's endpoint) instead of `/api/me/collections` (404). That lets the slug resolve, so t4's public-collection and public-rendering checks execute. The two `/api/creator/collections/{id}` calls are left untouched, as approved: their responses are discarded.

No assertion was added, removed or changed: the `check(...)` lines are identical. Line 57 of t3 passes `PAGE` into `page.evaluate`, because the browser context cannot see the Node variable. Its fetch, and the assertion that uses it, are unchanged.

## SHA-256 (`manifest.sha256`)
```
05e829c3802fd781a3240244ec287bbee9470bd2b2a314bf482f135e97232ac2  acceptance-14e/14e-1/amended/fixture.mjs
2e73e0f389520e2266def5cd70cda4c4a7671826f470456a889bca5f8b658b40  acceptance-14e/14e-1/amended/t3-media.mjs
205baa3713f5c8444c3655ef8759206187905499bcac1ef9df7ed5f0035700ad  acceptance-14e/14e-1/amended/t4-regression.mjs
```

## Original SHA-256
```
47acabea6f0afe8cc23b313938763c8b37a30b65ccca2a7e72e5af714e363280  acceptance-13e/scripts/t3-media.mjs
09a1c55553cb396676401d578ec4c7077606b1e2df2d3faefad7b15cca189454  acceptance-13e/scripts/t4-regression.mjs
```

## `diff acceptance-13e/scripts/t3-media.mjs amended/t3-media.mjs`
```diff
1a2
> import { resolveFixture } from './fixture.mjs';
5c6,7
< await page.goto(BASE + '/create/pages/586');
---
> const { COLL, PAGE } = await resolveFixture(page);
> await page.goto(BASE + '/create/pages/' + PAGE);
57c59
< const assetHref = await page.evaluate(async () => { const r = await fetch('/api/pages/586', { headers: { Authorization: 'Bearer ' + localStorage.getItem('auth_token') } }); const p = await r.json(); return p.blocks.find(b => b.type === 'image')?.assetId; });
---
> const assetHref = await page.evaluate(async (PAGE) => { const r = await fetch('/api/pages/' + PAGE, { headers: { Authorization: 'Bearer ' + localStorage.getItem('auth_token') } }); const p = await r.json(); return p.blocks.find(b => b.type === 'image')?.assetId; }, PAGE);
66c68
< await page.goto(BASE + '/create/collections/23');
---
> await page.goto(BASE + '/create/collections/' + COLL);
```

## `diff acceptance-13e/scripts/t4-regression.mjs amended/t4-regression.mjs`
```diff
1a2
> import { resolveFixture } from './fixture.mjs';
5a7
> const { COLL, PAGE } = await resolveFixture(page);
43c45
< await page.goto(BASE + '/create/pages/586'); await page.getByTestId('block-editor').waitFor();
---
> await page.goto(BASE + '/create/pages/' + PAGE); await page.getByTestId('block-editor').waitFor();
49,50c51,52
< const pg = await api('/pages/586');
< const coll = await api(`/creator/collections/23`).then(r => r).catch(() => null);
---
> const pg = await api('/pages/' + PAGE);
> const coll = await api(`/creator/collections/${COLL}`).then(r => r).catch(() => null);
53c55
< await page.goto(BASE + '/create/collections/23'); await page.waitForTimeout(800);
---
> await page.goto(BASE + '/create/collections/' + COLL); await page.waitForTimeout(800);
56,58c58,60
< const cd = await page.evaluate(async () => { const r = await fetch('/api/me/collections', { headers: { Authorization: 'Bearer ' + localStorage.getItem('auth_token') } }); return r.ok ? r.json() : r.status; });
< const mine = Array.isArray(cd) ? cd.find(c => c.id === 23) : null;
< console.log('collection 23', mine?.status, mine?.slug ?? '', typeof cd === 'number' ? cd : '');
---
> const cd = await page.evaluate(async () => { const r = await fetch('/api/collections/mine', { headers: { Authorization: 'Bearer ' + localStorage.getItem('auth_token') } }); return r.ok ? r.json() : r.status; });
> const mine = Array.isArray(cd) ? cd.find(c => c.id === COLL) : null;
> console.log('collection ' + COLL, mine?.status, mine?.slug ?? '', typeof cd === 'number' ? cd : '');
94c96
< await anon.goto(BASE + '/create/pages/586'); await anon.waitForTimeout(800);
---
> await anon.goto(BASE + '/create/pages/' + PAGE); await anon.waitForTimeout(800);
```

## Check counts (original vs amended)
- t3-media: original 13 `check(` call sites, amended 13
- t4-regression: original 10 `check(` call sites, amended 10
