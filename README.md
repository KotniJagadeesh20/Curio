# AlgoQuest

A learning platform: tracks → sections → lessons, plus practice problems. Content is managed by admins.

- **Frontend**: Vite, React, TypeScript, Tailwind, shadcn/ui, TanStack Query (`src/`)
- **Backend**: Spring Boot 3 (Java 17), Spring Security + JWT, JPA, Flyway (`backend/`)
- **Database**: PostgreSQL (H2 in-memory for quick local runs)

## Run locally

### 1. Backend

Quick start, no Docker (data resets on every restart):

```sh
cd backend
mvn spring-boot:run -Dspring-boot.run.profiles=h2
```

With Postgres (data persists):

```sh
docker compose up -d db       # from the project root (Postgres only; the optional minio service is not started)
cd backend && mvn spring-boot:run
```

The API listens on `http://localhost:8081`. On first start it creates an admin user:

| | default | override with |
|---|---|---|
| email | `admin@codemastery.local` | `ADMIN_EMAIL` |
| password | `ChangeMe123!` | `ADMIN_PASSWORD` |

**Change these, and set `JWT_SECRET` (32+ chars), in any real environment.**

### 2. Frontend

```sh
npm install                   # npm is the package manager; `npm ci` for a clean, lockfile-exact install
npm run dev                   # http://localhost:8080, proxies /api to the backend
```

`package-lock.json` is the only lockfile. The project came from a Lovable export that shipped `bun.lock`/`bun.lockb`;
those were removed so two lockfiles can't drift apart. Commit `package-lock.json` with any dependency change.

Sign in with the admin account, then open **Admin** from the avatar menu to manage tracks, lessons and problems.

## Tests

```sh
cd backend && mvn test        # integration tests on H2, no Docker needed
npm test                      # frontend (Vitest)
```

## Configuration

| Variable | Where | Purpose |
|---|---|---|
| `DB_URL`, `DB_USER`, `DB_PASSWORD` | backend | Postgres connection |
| `JWT_SECRET` | backend | token signing key |
| `CORS_ORIGINS` | backend | comma-separated allowed origins |
| `VITE_API_URL` | frontend | backend origin in production (empty in dev) |

## Content safety (creator pages)

Creator content is untrusted. Three separate boundaries, each with one job:

| Boundary | Where | What it does |
|---|---|---|
| Write | `BlockValidator` (backend) | Rejects a save with `400 {code: INVALID_BLOCKS, problems: [{id, field, message}]}`; never rewrites content |
| Read | `BlockSanitizer` (backend) | Projects stored blocks for public readers (both `/api/public/**` and the legacy `/api/tracks/**`); omits unsafe blocks; never changes the database |
| Render | `BlockRenderer` (frontend) | Assumes the API output is hostile: re-checks every URL, shows HTML only in a sandboxed iframe, SVG only through `<img>` |

**API contract for consumers of the public API.** Block fields are plain data except two:
- `svg` is clean markup (re-serialised from an allowlist). It is safe as data and as an `<img>` source. Do not inline it.
- `html` is author markup kept exactly as written, marked `"isolatedOnly": true`. **Never insert it into a page's DOM.** Render it only in
  `<iframe sandbox="">` (empty sandbox: no scripts, no same-origin) with `referrerpolicy="no-referrer"`, in a document whose first element is the
  restrictive CSP in `src/lib/htmlFrame.ts` (`htmlFrameDocument`). Nothing in a block is safe to insert as ordinary page HTML.

**Deployment: CSP for the app itself.** The API sends `default-src 'none'; frame-ancestors 'none'` (it only returns JSON). That does **not** protect
the web app: whatever serves the frontend must send its own `Content-Security-Policy` header, including `frame-ancestors` (a `<meta>` tag cannot).
Two things to know when writing it:
- an HTML block is a `srcdoc` iframe, and a `srcdoc` document **inherits the parent's CSP** (the two policies intersect). The app's policy must allow
  `style-src 'unsafe-inline'` or creator CSS inside HTML blocks stops working, and must allow `frame-src https://www.youtube.com https://player.vimeo.com`
  for video embeds;
- it must not weaken `script-src`: nothing in the app needs inline or remote scripts from creators.
Example starting point: `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' https: data:; media-src 'self' https:;
frame-src https://www.youtube.com https://player.vimeo.com; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'`.

## Content

The initial tracks, lessons and problems come from the Flyway migration `V2__seed_content.sql`.
`legacy-mock-data/` holds the original in-code data it was generated from (not part of the build).


## Media storage

Uploaded images are stored behind `MediaStorage`. `media.storage=local` (default, `MEDIA_STORAGE=local`) writes to `media.local.root` and is for development and tests only: single instance, and the data is lost on ephemeral hosting.

**Production must use S3-compatible storage**: set `MEDIA_STORAGE=s3`, `MEDIA_S3_BUCKET` (an existing, private bucket), and for a non-AWS store `MEDIA_S3_ENDPOINT` (plus `MEDIA_S3_PATH_STYLE=true` where needed) and `MEDIA_S3_ACCESS_KEY`/`MEDIA_S3_SECRET_KEY` (otherwise the default AWS credential chain is used). Activate the Spring profile `prod` or `production`: under either, `media.storage=local` (or any value other than `s3`) stops the application from starting, and an unreachable bucket does too. There is no silent fallback to disk.

**MinIO (optional).** `docker-compose.yml` has an optional `minio` service for trying S3 storage locally and for the S3 integration tests. It has no default image: official MinIO images are no longer published, so you must set `MINIO_IMAGE` to a build you have vetted (pinned by tag or digest) and start it explicitly: `MINIO_IMAGE=<image> docker compose up -d minio`. Anyone who only needs Postgres should use `docker compose up -d db` and can ignore MinIO.

The upload registry and the cleanup sweeper are per process, so run **one** instance. The S3 integration tests run only when `MINIO_TEST_ENDPOINT` is set; see PLAN.md "12c as built".
