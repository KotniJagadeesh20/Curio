#!/usr/bin/env python3
"""Builds a Flyway migration from content-src/system_design_part*.py.

    python3 backend/content-src/generate_sql.py <migration-version> <part-module>
    e.g.  python3 backend/content-src/generate_sql.py 4 system_design_part1
"""
import importlib, json, pathlib, re, sys

here = pathlib.Path(__file__).parent
version, module = sys.argv[1], sys.argv[2]
sys.path.insert(0, str(here))
mod = importlib.import_module(module)

REQUIRED = ["summary", "concept", "realWorld", "commonMistakes", "bestPractices", "interviewRelevance"]
q = lambda v: "'" + str(v).replace("'", "''") + "'"
out = [f"-- Generated from backend/content-src/{module}.py. Edit the source, not this file."]

for (section, slug), f in mod.LESSONS.items():
    missing = [k for k in REQUIRED if not f.get(k)]
    assert not missing, f"{section}/{slug} missing {missing}"
    for k, v in f.items():
        text = json.dumps(v) if not isinstance(v, str) else v
        assert "**" not in text and "```" not in text, f"{section}/{slug}.{k} contains markdown"
    sets = [
        f"summary = {q(f['summary'])}",
        f"concept = {q(f['concept'])}",
        f"real_world = {q(f['realWorld'])}",
        f"common_mistakes = {q(json.dumps(f['commonMistakes']))}",
        f"best_practices = {q(json.dumps(f['bestPractices']))}",
        f"interview_relevance = {q(f['interviewRelevance'])}",
    ]
    if "title" in f:
        sets.append(f"title = {q(f['title'])}")
    if "code_example" in f:
        sets += [f"code_language = {q(f['code_language'])}", f"code_example = {q(f['code_example'])}"]
    out.append(
        f"UPDATE lessons SET {', '.join(sets)}\n"
        f"WHERE slug = {q(slug)} AND section_id = (SELECT s.id FROM sections s JOIN tracks t ON t.id = s.track_id "
        f"WHERE t.slug = {q(mod.TRACK)} AND s.slug = {q(section)});"
    )

target = here.parent / "src/main/resources/db/migration" / f"V{version}__{module}.sql"
target.write_text("\n\n".join(out) + "\n")
print(f"wrote {target.name}: {len(mod.LESSONS)} lessons")
