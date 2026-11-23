// Scroll positions of public history entries (Step 14d-3). One module-level store shared by every public view.
//
// - Entries are keyed by an entry id (`<location.key>|<pathname><search>`, see usePublicArrival) and hold the numeric
//   position plus a content anchor: `{ y, anchor: { id, offset } | null, seq }`.
// - `seq` orders samples: a write with a LOWER seq than the stored one is ignored, so a late write never overwrites a
//   newer position. Sequence numbers come only from `nextSeq()`, which always starts above every persisted value
//   (so samples taken after a reload are never mistaken for stale ones).
// - Mirrored to sessionStorage (per tab). Any storage failure (unavailable, quota, security) switches persistence off
//   for the rest of the page lifetime; the in-memory map keeps working, with the same 200-entry cap. Nothing here ever
//   throws.

export interface ScrollAnchorSample { id: string; offset: number }
export interface ScrollSample { y: number; anchor: ScrollAnchorSample | null; seq: number }

export const ENTRY_PREFIX = "curio:scroll:";
export const SEQ_KEY = "curio:scrollseq";
export const MAX_ENTRIES = 200;

const mem = new Map<string, ScrollSample>();
let persist = true;
let loaded = false;
let counter: number | null = null;

/** sessionStorage, or null once persistence is off (or it can't be reached). */
function storage(): Storage | null {
  if (!persist) return null;
  try {
    return window.sessionStorage;
  } catch {
    persist = false;
    return null;
  }
}

const isSample = (v: unknown): v is ScrollSample => {
  const s = v as ScrollSample | null;
  return !!s && typeof s === "object" && Number.isFinite(s.y) && Number.isFinite(s.seq)
    && (s.anchor === null || (!!s.anchor && typeof s.anchor.id === "string" && Number.isFinite(s.anchor.offset)));
};

/** Loads persisted entries into memory once per page lifetime. */
function load() {
  if (loaded) return;
  loaded = true;
  const st = storage();
  if (!st) return;
  try {
    for (let i = 0; i < st.length; i++) {
      const k = st.key(i);
      if (!k || !k.startsWith(ENTRY_PREFIX)) continue;
      try {
        const v: unknown = JSON.parse(st.getItem(k) ?? "null");
        if (isSample(v)) mem.set(k.slice(ENTRY_PREFIX.length), v);
      } catch { /* a corrupt entry is ignored */ }
    }
  } catch {
    persist = false;
  }
}

/** The next sequence number: always above the persisted counter and every persisted entry's seq. */
export function nextSeq(): number {
  load();
  if (counter === null) {
    let max = 0;
    for (const v of mem.values()) max = Math.max(max, v.seq);
    try {
      const c = Number(storage()?.getItem(SEQ_KEY));
      if (Number.isFinite(c)) max = Math.max(max, c);
    } catch {
      persist = false;
    }
    counter = max;
  }
  counter += 1;
  return counter;
}

export function readEntry(id: string): ScrollSample | undefined {
  load();
  return mem.get(id);
}

/** Stores a sample unless the stored one is newer. Returns whether it was stored. */
export function writeEntry(id: string, sample: ScrollSample): boolean {
  load();
  const current = mem.get(id);
  if (current && current.seq > sample.seq) return false;
  mem.delete(id);                                // re-insert: a rewritten entry is the newest
  mem.set(id, { y: sample.y, anchor: sample.anchor ? { ...sample.anchor } : null, seq: sample.seq });
  const st = storage();
  if (st) {
    try {
      st.setItem(ENTRY_PREFIX + id, JSON.stringify(mem.get(id)));
      st.setItem(SEQ_KEY, String(Math.max(sample.seq, counter ?? 0)));
    } catch {
      persist = false;                           // quota/security: memory only from now on
    }
  }
  evict();
  return true;
}

/** Keeps the newest MAX_ENTRIES entries (by seq), in memory and (while persisting) in storage. */
function evict() {
  if (mem.size <= MAX_ENTRIES) return;
  const oldest = [...mem.entries()].sort((a, b) => a[1].seq - b[1].seq).slice(0, mem.size - MAX_ENTRIES);
  for (const [id] of oldest) {
    mem.delete(id);
    const st = storage();
    if (st) {
      try { st.removeItem(ENTRY_PREFIX + id); } catch { persist = false; }
    }
  }
}

/** Whether entries are still mirrored to sessionStorage (false after the first storage failure). For tests and diagnostics. */
export const isPersisting = () => persist;
