#!/usr/bin/env python3
"""Step 14d-3 sensitivity runs (brief rev. 1 §4 + rev. 2 C3). Each mutation: back up the file, apply ONE mutation, run the
new unit/integration tests (and, where listed, the targeted browser script), save the output, restore and verify the file
is byte-identical. Usage: sensitivity.py <repo> <pw dir> <out dir> [numbers...]"""
import filecmp, os, re, shutil, subprocess, sys, time

REPO, PW, OUT = sys.argv[1], sys.argv[2], sys.argv[3]
ONLY = set(int(x) for x in sys.argv[4:])
HOOK = "src/hooks/usePublicArrival.ts"
TESTS = ["src/hooks/usePublicArrival.test.tsx", "src/lib/scrollStore.test.ts", "src/lib/scrollAnchor.test.ts",
         "src/pages/public/PageView.navigation.test.tsx", "src/pages/public/CollectionView.arrival.test.tsx",
         "src/pages/public/Discover.arrival.test.tsx", "src/components/public/NotAvailable.focus.test.tsx"]

M = {
  1: ("Captured sample written under the NEW entry id (latest captured sample, no window.scrollY read)", HOOK, [
      ("const write = () => { if (sample) writeEntry(sample.entry, sample); };", "const write = () => { if (sample) writeEntry(entry!, sample); };"),
      ("      if (entry !== null && entry !== nextEntry) flush(false);   // outgoing entry, under its captured id\n      entry = nextEntry;",
       "      const prevEntry = entry;\n      entry = nextEntry;\n      if (prevEntry !== null && prevEntry !== nextEntry) flush(false);"),
    ], True),
  2: ("No anchor correction after delayed images (restoration observer and load triggers are no-ops)", HOOK, [
      ("const restoration = new ResizeObserver(correct);", "const restoration = new ResizeObserver(() => {});"),
      ("const onLoad = (e: Event) => { if (content?.contains(e.target as Node)) correct(); };", "const onLoad = (e: Event) => { void e; };"),
    ], True),
  3: ("Root-only observation: the restoration observer observes document.documentElement only", HOOK, [
      ("    if (content) restoration.observe(content);\n    if (el.parentElement && el.parentElement !== content) restoration.observe(el.parentElement);",
       "    restoration.observe(document.documentElement);"),
    ], True),
  4: ("Tracking armed during POP restoration (armed at the start of restore)", HOOK, [
      ("    setScrollY(t.y);                                        // coarse numeric placement", "    arm();\n    setScrollY(t.y);"),
    ], True),
  5: ("Stale generation: frames and settling of a superseded arrival still act (no per-arrival generation checks)", HOOK, [
      ("      if (arrival?.gen !== a.gen) return;\n      const el = t.anchor", "      const el = t.anchor"),
      ("requestAnimationFrame(() => { if (arrival?.gen === g) arm(); });", "requestAnimationFrame(() => { arm(); });"),
      ("if (armNow && arrival?.gen === g) arm();", "if (armNow) arm();"),
    ], True),
  6: ("The unmount cleanup doesn't flush", HOOK, [
      ("      flush(true);                                          // the outgoing DOM is still attached here\n", ""),
    ], True),
  7: ("One shared ResizeObserver for both jobs (pre-rev-4.3: corrects while settling, samples once armed; no hand-off)", HOOK, [
      ("const restoration = new ResizeObserver(correct);", "const restoration = new ResizeObserver(() => (armed ? takeSample() : correct()));"),
      ("      restoration.disconnect();\n      document.removeEventListener(\"load\", onLoad, true);", "      document.removeEventListener(\"load\", onLoad, true);"),
      ("if (armNow && arrival?.gen === g) arm();", "if (armNow && arrival?.gen === g) { armed = true; tracking = restoration; }"),
    ], False),
  8: ("Retry success restarts the arrival (scrolls to the top again)", HOOK, [
      ('      else { a.phase = "DONE"; focus(headingRef); }', '      else { a.phase = "DONE"; setScrollY(0); focus(headingRef); }'),
    ], False),
  9: ("Drawer: no onCloseAutoFocus prevention", "src/pages/public/PageView.tsx", [
      ("\n          onCloseAutoFocus={(e) => { if (closedByNavigation.current) { e.preventDefault(); closedByNavigation.current = false; } }}>", ">"),
    ], True),
  10: ("The seq check removed from the store", "src/lib/scrollStore.ts", [
      ("  if (current && current.seq > sample.seq) return false;\n", ""),
    ], False),
}

def failing(out):
    return sorted(set(m.group(1).strip() for m in re.finditer(r"^\s*×\s+(.+?)(?:\s+\d+ms)?$", out, re.M)))

summary = []
for n, (title, rel, edits, browser) in M.items():
    if ONLY and n not in ONLY:
        continue
    path = os.path.join(REPO, rel)
    backup = path + ".sens-backup"
    shutil.copy2(path, backup)
    try:
        src = open(path).read()
        for old, new in edits:
            assert src.count(old) == 1, f"mutation {n}: pattern not found once: {old[:60]!r}"
            src = src.replace(old, new)
        open(path, "w").write(src)
        unit = subprocess.run(["npx", "vitest", "run", *TESTS], cwd=REPO, capture_output=True, text=True).stdout
        unit_fail = failing(unit)
        browser_out, browser_fail = "", []
        if browser:
            time.sleep(4)                                   # let Vite's HMR serve the mutated module
            b = subprocess.run(["node", "t14d3.mjs", os.path.join(OUT, f"sens-{n}-shots")], cwd=PW, capture_output=True, text=True)
            browser_out = b.stdout + b.stderr
            browser_fail = [l for l in browser_out.splitlines() if l.startswith("FAIL")]
    finally:
        shutil.copy2(backup, path)
        os.remove(backup)
    identical = filecmp.cmp(path, os.path.join("/private/tmp/claude-503/-Users-newuser-Downloads-Curio-main/b95c57d2-d3f6-4675-a7f6-45afed6984a6/scratchpad/fixed14d3", rel), shallow=False)
    with open(os.path.join(OUT, f"sensitivity-{n}.txt"), "w") as f:
        f.write(f"Mutation {n}: {title}\nFile: {rel}\nEdits:\n")
        for old, new in edits:
            f.write(f"  - {old!r}\n  + {new!r}\n")
        f.write(f"\nRestored and byte-identical to the fixed file: {identical}\n")
        f.write(f"\n== Failing unit/integration tests ({len(unit_fail)}):\n" + "\n".join("  × " + t for t in unit_fail) + "\n")
        if browser:
            f.write(f"\n== Failing browser checks ({len(browser_fail)}):\n" + "\n".join("  " + l for l in browser_fail) + "\n")
        f.write("\n== Raw vitest output\n" + unit)
        if browser:
            f.write("\n== Raw browser output\n" + browser_out)
    summary.append((n, title, len(unit_fail), len(browser_fail) if browser else None, identical))
    print(f"#{n}: unit failures={len(unit_fail)} browser failures={len(browser_fail) if browser else '-'} restored={identical}", flush=True)
