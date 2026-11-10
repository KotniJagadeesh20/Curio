// Mirrors the backend DTOs (backend/.../content/ContentDtos.java, auth/AuthDtos.java)

export type Difficulty = "easy" | "medium" | "hard";

export interface User {
  id: number;
  name: string;
  email: string;
  /** Lowercase, immutable; appears in public URLs (/@username). */
  username: string;
  role: "USER" | "ADMIN";
  createdAt: string;
}

export interface AuthResponse {
  token: string;
  user: User;
}

export interface LessonSummary {
  id: number;
  slug: string;
  title: string;
  duration: string | null;
  published: boolean;
}

export interface Section {
  id: number;
  slug: string;
  title: string;
  icon: string;
  position: number;
  lessons: LessonSummary[];
}

export interface TrackSummary {
  id: number;
  slug: string;
  name: string;
  description: string;
  icon: string;
  color: string;
  difficulty: string;
  estimatedHours: number;
  position: number;
  published: boolean;
  sectionCount: number;
  lessonCount: number;
}

export interface TrackDetail {
  track: TrackSummary;
  sections: Section[];
}

export interface Lesson {
  id: number;
  sectionId: number;
  trackSlug: string;
  sectionSlug: string;
  slug: string;
  title: string;
  summary: string;
  concept: string;
  realWorld: string;
  commonMistakes: string[];
  bestPractices: string[];
  interviewRelevance: string;
  duration: string | null;
  codeLanguage: string | null;
  codeExample: string | null;
  /** null = legacy lesson using concept/code/etc. */
  blocks: Record<string, unknown>[] | null;
  position: number;
  published: boolean;
}

export interface ProblemExample {
  input: string;
  output: string;
  explanation: string;
}

export interface ProblemSummary {
  id: number;
  slug: string;
  title: string;
  difficulty: Difficulty;
  trackSlug: string | null;
  category: string;
  concept: string;
  excerpt: string;
  published: boolean;
}

export interface Problem extends ProblemSummary {
  description: string;
  examples: ProblemExample[];
  constraints: string[];
  hints: string[];
  solution: string;
  language: string;
  starterCode: string;
}

// ---------------------------------------------------------------------------
// Creator platform (Steps 5-6). Mirrors backend/.../collection/CollectionDtos.java and PublicDtos.java.
// Naming: Collection = Track, Module = Section, Page = Lesson (renamed in the API only).
// ---------------------------------------------------------------------------

export type CollectionStatus = "DRAFT" | "PUBLISHED" | "UNLISTED";
export type PageStatus = "DRAFT" | "PUBLISHED";

/**
 * A block as it travels over the API: a flat JSON object `{type, ...fields}` (PLAN decision 2). This is only the wire
 * shape; the typed block model (the nine known types) lives in lib/blocks.ts. Server-side schema validation: Step 11.
 */
export type StoredBlock = { type: string } & Record<string, unknown>;

// ---- creator workspace (authenticated, owner only) ----
export interface CreatorPageSummary {
  id: number;
  slug: string;
  title: string;
  status: PageStatus;
  position: number;
  /** Meaningful body content (not []/blank blocks); legacy pages count when an old field is filled. */
  hasContent: boolean;
}

export interface CreatorModule {
  id: number;
  collectionId: number;
  slug: string;
  title: string;
  position: number;
  pages: CreatorPageSummary[];
}

export interface CreatorPage {
  id: number;
  moduleId: number;
  collectionId: number;
  slug: string;
  title: string;
  summary: string;
  /**
   * Three distinct states: `null` + `legacy` = never saved with blocks (see `legacyContent`); an array (possibly empty)
   * = readable; `null` + `blocksUnreadable` = the stored body can't be interpreted and is left exactly as stored.
   */
  blocks: StoredBlock[] | null;
  status: PageStatus;
  position: number;
  /** true = an old seeded page without blocks */
  legacy: boolean;
  /** The old structured fields readers still see; present only while `legacy`. */
  legacyContent: PublicLegacyContent | null;
  /** The stored body is malformed. The server refuses to replace it unless `discardUnreadableContent` is sent. */
  blocksUnreadable: boolean;
  /** Content version (optimistic concurrency): send it back as `expectedVersion`. Not bumped by publish/unpublish/reorder. */
  version: number;
}

export interface CollectionSummary {
  id: number;
  slug: string;
  title: string;
  description: string;
  coverUrl: string | null;
  /** The uploaded-image cover (Step 12b), or null. At most one of this and `coverUrl` is set. */
  coverAssetId?: string | null;
  categoryId: number | null;
  /** What the creator chose. */
  status: CollectionStatus;
  /** Whether readers can actually open it (false when empty, hidden, deleted or the owner is suspended). */
  publiclyVisible: boolean;
  hiddenByModeration: boolean;
  moduleCount: number;
  pageCount: number;
  publishedPageCount: number;
  /** "N draft pages not visible" */
  draftPageCount: number;
  deletedAt: string | null;
  restorableUntil: string | null;
}

export interface CollectionDetail {
  collection: CollectionSummary;
  modules: CreatorModule[];
}

// ---- creator workspace requests (mirror CollectionCreate/Update, ModuleCreate/Update, PageCreate/Update) ----
/** Strict on the server: only these fields are accepted (an unknown one is a 400). "" clears description/coverUrl; omitted = unchanged. */
export interface CollectionInput {
  title: string;
  slug?: string;
  description?: string;
  coverUrl?: string;
  /**
   * An uploaded image as the cover; `null` clears it. Never sent together with `coverUrl` (the server answers 400); see `coverFields`.
   * Omitted = unchanged.
   */
  coverAssetId?: string | null;
  /** Can be set or changed but not cleared (the API treats null as "unchanged"). */
  categoryId?: number | null;
}
export interface ModuleInput {
  title: string;
  slug?: string;
}
export interface PageInput {
  title: string;
  slug?: string;
  summary?: string;
  /** Omit to leave the stored blocks untouched ([] clears them). */
  blocks?: StoredBlock[];
  /** Explicit recovery: only with `blocks`, and only for a page whose `blocksUnreadable` is true (else the server answers 400). */
  discardUnreadableContent?: boolean;
  /** The `version` this edit was based on; a stale value is refused with 409 (code VERSION_CONFLICT). Omit = last write wins. */
  expectedVersion?: number;
  /** Set by autosave only: the server refuses it (409, code PAGE_PUBLISHED) for a published page. */
  autosave?: boolean;
}
/** GET /api/public/categories */
export interface Category {
  id: number;
  slug: string;
  name: string;
  icon: string;
  position: number;
}

// ---- public reading (anonymous, slug-based, no ids) ----
export interface PublicCreatorRef {
  username: string;
  displayName: string;
}

export interface PublicCategoryRef {
  slug: string;
  name: string;
}

export interface PublicCollectionSummary {
  slug: string;
  title: string;
  description: string;
  coverUrl: string | null;
  category: PublicCategoryRef | null;
  creator: PublicCreatorRef;
  moduleCount: number;
  pageCount: number;
}

export interface PublicPageSummary {
  slug: string;
  title: string;
  summary: string;
  position: number;
}

export interface PublicModule {
  slug: string;
  title: string;
  position: number;
  pages: PublicPageSummary[];
}

export interface PublicCollectionDetail {
  collection: PublicCollectionSummary;
  /** Reachable by direct link only: clients should not index it. */
  unlisted: boolean;
  modules: PublicModule[];
}

export interface PublicLegacyContent {
  concept: string;
  realWorld: string;
  commonMistakes: string[];
  bestPractices: string[];
  interviewRelevance: string;
  codeLanguage: string | null;
  codeExample: string | null;
}

export interface PublicPageView {
  collection: { slug: string; title: string; creator: PublicCreatorRef; unlisted: boolean };
  module: { slug: string; title: string };
  page: {
    slug: string;
    title: string;
    summary: string;
    /** null for an old seeded page; then `legacy` is set. */
    blocks: StoredBlock[] | null;
    legacy: PublicLegacyContent | null;
  };
}

export interface Paged<T> {
  items: T[];
  page: number;
  size: number;
  totalItems: number;
  totalPages: number;
}
