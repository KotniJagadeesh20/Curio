# Compare axe14e.json runs (A11Y plan rev. 2 §4): per (view, viewport, rule) node counts, baseline vs new.
# Usage: python3 -I compare-axe.py <baseline run dir>... -- <new run dir>...
import json, sys, os
from collections import Counter
args = sys.argv[1:]; i = args.index('--'); base, new = args[:i], args[i + 1:]
TARGET = {'button-name', 'link-name'}

def load(d):
    j = json.load(open(os.path.join(d, 'axe14e.json')))
    c = Counter(); impact = {}
    for s in j['scans']:
        for v in s['violations']:
            c[(s['view'], s['viewport'], v['id'])] += len(v['nodes']); impact[v['id']] = v['impact']
    return j, c, impact

ok = True
bl = [load(d) for d in base]; nw = [load(d) for d in new]
print(f"axe-core: baseline {[b[0]['axeVersion'] for b in bl]}, new {[n[0]['axeVersion'] for n in nw]}")
for name, runs in (('baseline', bl), ('new', nw)):
    for d, (j, c, imp) in zip(base if name == 'baseline' else new, runs):
        by = Counter()
        for (v, vp, r), n in c.items(): by[imp[r]] += n
        print(f"{name} {d}: scans {len(j['scans'])}, rendered {sum(1 for s in j['scans'] if s.get('rendered'))}, nodes by impact {dict(by)}, "
              f"button-name {sum(n for k, n in c.items() if k[2] == 'button-name')}, link-name {sum(n for k, n in c.items() if k[2] == 'link-name')}")
ref = bl[0][1]
for d, (j, c, imp) in zip(base, bl):
    if {k: v for k, v in c.items()} != dict(ref): print(f"NOTE baseline {d} differs from baseline run 1")
other_ref = {k: v for k, v in ref.items() if k[2] not in TARGET}
for d, (j, c, imp) in zip(new, nw):
    if len(j['scans']) != 22: ok = False; print(f"FAIL {d}: {len(j['scans'])} scans, expected 22")
    tgt = {k: v for k, v in c.items() if k[2] in TARGET}
    if tgt: ok = False; print(f"FAIL {d}: button-name/link-name remain: {tgt}")
    else: print(f"PASS {d}: button-name and link-name = 0 nodes in all views at both viewports")
    other = {k: v for k, v in c.items() if k[2] not in TARGET}
    if other == other_ref: print(f"PASS {d}: every other finding identical to baseline run 1 ({sum(other.values())} nodes, rules {sorted({k[2] for k in other})})")
    else:
        ok = False
        for k in sorted(set(other) | set(other_ref)):
            if other.get(k, 0) != other_ref.get(k, 0): print(f"DIFF {d}: {k} baseline {other_ref.get(k, 0)} → new {other.get(k, 0)}")
print('RESULT', 'PASS' if ok else 'FAIL')
sys.exit(0 if ok else 1)
