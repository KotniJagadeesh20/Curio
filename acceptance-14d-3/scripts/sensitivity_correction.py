#!/usr/bin/env python3
"""Step 14d-3 correction round: sensitivity runs for the new/changed guards. Each mutation: back up, apply ONE mutation,
run the 14d-3 test files (RUNS times), optionally the correction browser script, save, restore, verify byte-identical.
Usage: sensitivity_correction.py <repo> <pw dir> <out dir> [ids...]"""
import filecmp, os, re, shutil, subprocess, sys

REPO, PW, OUT = sys.argv[1], sys.argv[2], sys.argv[3]
ONLY = set(sys.argv[4:])
HOOK = "src/hooks/usePublicArrival.ts"
TESTS = ["src/hooks/usePublicArrival.test.tsx", "src/lib/scrollStore.test.ts", "src/lib/scrollAnchor.test.ts",
         "src/pages/public/PageView.navigation.test.tsx", "src/pages/public/CollectionView.arrival.test.tsx",
         "src/pages/public/Discover.arrival.test.tsx", "src/components/public/NotAvailable.focus.test.tsx",
         "src/pages/public/ContentsDrawer.focus.test.tsx", "src/components/public/PublicBlocks.frameSize.test.tsx"]
M = {
  "9": ("Drawer: no onCloseAutoFocus prevention (original sensitivity #9), 10 unit runs + 3 browser runs", "src/pages/public/PageView.tsx", [
      ("\n          onCloseAutoFocus={(e) => { if (closedByNavigation.current) { e.preventDefault(); closedByNavigation.current = false; } }}>", ">"),
    ], 10, True),
  "R1": ("Readiness ignores media (stable time or cap only)", HOOK, [
      ("else if (now - lastMove >= SETTLE_STABLE_MS && mediaBeforeReady(contentRef.current, el)) finish(true);",
       "else if (now - lastMove >= SETTLE_STABLE_MS) finish(true);"),
    ], 1, False),
  "R2": ("Readiness waits for EVERY image in the content, not only those before the anchor", HOOK, [
      ("every((img) => img.complete || !before(img))", "every((img) => img.complete)"),
    ], 1, False),
  "O1": ("overflow-anchor never put back when settling ends", HOOK, [
      ("      root.style.overflowAnchor = prevAnchoring;\n", ""),
    ], 1, False),
  "O2": ("overflow-anchor put back as \"\" instead of the previous inline value", HOOK, [
      ("      root.style.overflowAnchor = prevAnchoring;\n", "      root.style.overflowAnchor = \"\";\n"),
    ], 1, False),
  "O3": ("A new arrival doesn't stop the previous arrival's settling", HOOK, [
      ("      arrivalKey = nextKey;\n      stopSettling?.();\n", "      arrivalKey = nextKey;\n"),
    ], 1, False),
  "O4": ("Unmount doesn't stop settling", HOOK, [
      ("      stopSettling?.();\n      disarm();\n      arrival = null;", "      disarm();\n      arrival = null;"),
    ], 1, False),
  "F1": ("Video embeds lose their reserved aspect ratio (BlockRenderer, 14c code, mutated only for this run)", "src/components/editor/BlockRenderer.tsx", [
      ('className="w-full aspect-video rounded-xl border border-border"', 'className="w-full rounded-xl border border-border"'),
    ], 1, True),
  # ---- native-video correction (plan rev. 2) ----
  "V1": ("Native videos excluded from readiness", HOOK, [
      ('\n      && Array.from(content.querySelectorAll("video")).every((v) => videoReady(v) || !before(v));', ";"),
    ], 1, True),
  "V2": ("No loadedmetadata correction trigger (the restoration ResizeObserver remains)", HOOK, [
      ('    document.addEventListener("loadedmetadata", onLoad, true);   // doesn\'t bubble: capture (native video dimensions)\n', ""),
    ], 1, True),
  "V3": ("Document-order check removed for videos (every video in the content holds settling)", HOOK, [
      ("every((v) => videoReady(v) || !before(v))", "every((v) => videoReady(v))"),
    ], 1, False),
  "V4": ("loadeddata instead of loadedmetadata", HOOK, [
      ('    document.addEventListener("loadedmetadata", onLoad, true);', '    document.addEventListener("loadeddata", onLoad, true);'),
      ('      document.removeEventListener("loadedmetadata", onLoad, true);', '      document.removeEventListener("loadeddata", onLoad, true);'),
    ], 1, True),
  "V5": ("Both networkState clauses removed from videoReady", HOOK, [
      ('\n    || (v.networkState === HTMLMediaElement.NETWORK_NO_SOURCE && v.currentSrc !== "")\n    || (v.networkState === HTMLMediaElement.NETWORK_EMPTY && !declaresSource(v));', ";"),
    ], 1, False),
  # ---- network-state correction ----
  "V6": ("NETWORK_EMPTY counts as ready even with a declared source (the reviewed video-ZIP rule)", HOOK, [
      ("(v.networkState === HTMLMediaElement.NETWORK_EMPTY && !declaresSource(v))", "v.networkState === HTMLMediaElement.NETWORK_EMPTY"),
    ], 1, False),
  "V7": ("NETWORK_NO_SOURCE counts as ready before any candidate was tried (no currentSrc check)", HOOK, [
      ('(v.networkState === HTMLMediaElement.NETWORK_NO_SOURCE && v.currentSrc !== "")', "v.networkState === HTMLMediaElement.NETWORK_NO_SOURCE"),
    ], 1, True),
}

def summarize(text):
    keep = [l for l in text.splitlines() if re.search(r"(✓|×|❯) |Tests |^PASS|^FAIL|checks passed", l)]
    return "\n".join(keep)

os.makedirs(OUT, exist_ok=True)
for key, (title, rel, edits, runs, browser) in M.items():
    if ONLY and key not in ONLY: continue
    path = os.path.join(REPO, rel); backup = path + ".sensbak"
    shutil.copy2(path, backup)
    src = open(path, encoding="utf-8").read()
    for old, new in edits:
        assert src.count(old) == 1, f"{key}: pattern not found once: {old[:60]}"
        src = src.replace(old, new)
    open(path, "w", encoding="utf-8").write(src)
    log = [f"# Sensitivity {key}: {title}", f"File: {rel}", ""]
    try:
        for i in range(runs):
            r = subprocess.run(["npx", "vitest", "run", *TESTS], cwd=REPO, capture_output=True, text=True)
            log += [f"## unit run {i + 1}/{runs} (exit {r.returncode})", summarize(r.stdout + r.stderr), ""]
        if browser:
            import time; time.sleep(2)   # Vite HMR picks up the mutated file
            for i in range(3):
                r = subprocess.run(["node", "t14d3c.mjs"], cwd=PW, capture_output=True, text=True)
                log += [f"## browser t14d3c.mjs run {i + 1}/3 (exit {r.returncode})", r.stdout.strip(), ""]
    finally:
        shutil.move(backup, path)
        verified = os.path.join(PW, "verified-src", rel)
        same = filecmp.cmp(path, verified, shallow=False) if os.path.exists(verified) else None
        log.insert(2, f"Restored and byte-identical to the verified copy: {same}")
    open(os.path.join(OUT, f"sensitivity-{key}.txt"), "w", encoding="utf-8").write("\n".join(log) + "\n")
    print(key, "done")
