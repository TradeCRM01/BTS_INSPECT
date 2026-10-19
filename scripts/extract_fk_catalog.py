#!/usr/bin/env python3
"""Extract every FK to profiles(id) or auth.users(id) from supabase/migrations.

Last-write-wins per (table, column), including later ALTER CONSTRAINT / DROP|SET NOT NULL.
Emits CREATE TABLE stubs used on real PG before querying pg_constraint.
"""
from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MIG_DIR = ROOT / "supabase" / "migrations"

CREATE_TABLE = re.compile(
    r"CREATE TABLE(?:\s+IF NOT EXISTS)?\s+(?:public\.)?([a-zA-Z_][a-zA-Z0-9_]*)",
    re.I,
)
ALTER_TABLE = re.compile(
    r"ALTER TABLE(?:\s+ONLY)?\s+(?:public\.)?([a-zA-Z_][a-zA-Z0-9_]*)",
    re.I,
)
COL_REF = re.compile(
    r"""
    (?P<col>[a-zA-Z_][a-zA-Z0-9_]*)
    \s+uuid
    (?P<nn>\s+NOT\s+NULL)?
    (?:\s+PRIMARY\s+KEY)?
    (?:\s+DEFAULT\s+[^,;]+?)?
    \s+REFERENCES\s+(?:public\.)?(?P<tgt>profiles|auth\.users)
    \s*\(\s*id\s*\)
    (?:\s+ON\s+DELETE\s+(?P<act>CASCADE|SET\s+NULL|RESTRICT|NO\s+ACTION))?
    """,
    re.I | re.X,
)
ADD_COL = re.compile(
    r"""
    ALTER\s+TABLE(?:\s+ONLY)?\s+(?:public\.)?(?P<table>[a-zA-Z_][a-zA-Z0-9_]*)
    [^;]*?
    ADD\s+COLUMN(?:\s+IF\s+NOT\s+EXISTS)?\s+
    (?P<col>[a-zA-Z_][a-zA-Z0-9_]*)
    \s+uuid
    (?P<nn>\s+NOT\s+NULL)?
    (?:\s+DEFAULT\s+[^,;]+?)?
    \s+REFERENCES\s+(?:public\.)?(?P<tgt>profiles|auth\.users)
    \s*\(\s*id\s*\)
    (?:\s+ON\s+DELETE\s+(?P<act>CASCADE|SET\s+NULL|RESTRICT|NO\s+ACTION))?
    """,
    re.I | re.S | re.X,
)
ADD_FK = re.compile(
    r"""
    ALTER\s+TABLE(?:\s+ONLY)?\s+(?:public\.)?(?P<table>[a-zA-Z_][a-zA-Z0-9_]*)
    [^;]*?
    ADD\s+CONSTRAINT\s+[a-zA-Z_][a-zA-Z0-9_]*\s+
    FOREIGN\s+KEY\s*\(\s*(?P<col>[a-zA-Z_][a-zA-Z0-9_]*)\s*\)
    \s+REFERENCES\s+(?:public\.)?(?P<tgt>profiles|auth\.users)
    \s*\(\s*id\s*\)
    (?:\s+ON\s+DELETE\s+(?P<act>CASCADE|SET\s+NULL|RESTRICT|NO\s+ACTION))?
    """,
    re.I | re.S | re.X,
)
DROP_NN = re.compile(
    r"ALTER\s+TABLE(?:\s+ONLY)?\s+(?:public\.)?([a-zA-Z_][a-zA-Z0-9_]*)[^;]*?ALTER\s+COLUMN\s+([a-zA-Z_][a-zA-Z0-9_]*)\s+DROP\s+NOT\s+NULL",
    re.I | re.S,
)
SET_NN = re.compile(
    r"ALTER\s+TABLE(?:\s+ONLY)?\s+(?:public\.)?([a-zA-Z_][a-zA-Z0-9_]*)[^;]*?ALTER\s+COLUMN\s+([a-zA-Z_][a-zA-Z0-9_]*)\s+SET\s+NOT\s+NULL",
    re.I | re.S,
)

SKIP_TABLES = {"proof_result"}


def act_name(raw: str | None) -> str:
    if not raw:
        return "NO ACTION"
    return " ".join(raw.upper().split())


def put(fks: dict, table: str, col: str, tgt: str, act: str | None, nn: bool | None, src: str) -> None:
    if table in SKIP_TABLES:
        return
    key = (table, col)
    prev = fks.get(key, {})
    fks[key] = {
        "table": table,
        "column": col,
        "target": "auth.users" if tgt.lower() == "auth.users" else "profiles",
        "on_delete": act_name(act) if act is not None or key not in fks else prev.get("on_delete", "NO ACTION"),
        "not_null": nn if nn is not None else prev.get("not_null", False),
        "src": src,
    }
    if act is not None:
        fks[key]["on_delete"] = act_name(act)


def main() -> int:
    fks: dict[tuple[str, str], dict] = {}
    events: list[tuple[int, str, tuple]] = []
    for path in sorted(MIG_DIR.glob("*.sql")):
        text = path.read_text()
        # CREATE TABLE inline column FKs
        table = None
        for raw_line in text.splitlines():
            line = raw_line.split("--", 1)[0]
            m = CREATE_TABLE.search(line)
            if m:
                table = m.group(1)
            if not table:
                continue
            for match in COL_REF.finditer(line):
                col = match.group("col")
                if col.lower() in {"uuid", "not"}:
                    continue
                nn = bool(match.group("nn")) or "PRIMARY KEY" in match.group(0).upper()
                put(
                    fks,
                    table,
                    col,
                    match.group("tgt"),
                    match.group("act"),
                    nn,
                    path.name,
                )
        for match in ADD_COL.finditer(text):
            put(
                fks,
                match.group("table"),
                match.group("col"),
                match.group("tgt"),
                match.group("act"),
                bool(match.group("nn")),
                path.name,
            )
        for match in ADD_FK.finditer(text):
            put(
                fks,
                match.group("table"),
                match.group("col"),
                match.group("tgt"),
                match.group("act"),
                None,
                path.name,
            )
        for match in DROP_NN.finditer(text):
            key = (match.group(1), match.group(2))
            if key in fks:
                fks[key]["not_null"] = False
                fks[key]["src"] = path.name
        for match in SET_NN.finditer(text):
            key = (match.group(1), match.group(2))
            if key in fks:
                fks[key]["not_null"] = True
                fks[key]["src"] = path.name

    rows = sorted(fks.values(), key=lambda r: (r["table"], r["column"]))
    mode = sys.argv[1] if len(sys.argv) > 1 else "sql"

    if mode == "tsv":
        print("table\tcolumn\ttarget\ton_delete\tnot_null\tlast_migration")
        for r in rows:
            print(f"{r['table']}\t{r['column']}\t{r['target']}\t{r['on_delete']}\t{r['not_null']}\t{r['src']}")
        return 0

    print("CREATE SCHEMA IF NOT EXISTS auth;")
    print("CREATE TABLE IF NOT EXISTS auth.users (id uuid PRIMARY KEY);")
    print("CREATE TABLE IF NOT EXISTS public.profiles (")
    print("  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,")
    print("  name text,")
    print("  licence_number text")
    print(");")
    print("CREATE TABLE IF NOT EXISTS public.inspections (")
    print("  id uuid PRIMARY KEY,")
    print("  inspector_id uuid NOT NULL")
    print(");")
    seen_tables = {"profiles", "inspections", "auth"}
    for r in rows:
        if r["table"] in {"profiles", "auth.users"}:
            continue
        if r["table"] not in seen_tables:
            print(f"CREATE TABLE IF NOT EXISTS public.{r['table']} (id uuid PRIMARY KEY);")
            seen_tables.add(r["table"])
        nn = " NOT NULL" if r["not_null"] else ""
        print(
            f"ALTER TABLE public.{r['table']} "
            f"ADD COLUMN IF NOT EXISTS {r['column']} uuid{nn};"
        )
        print(
            f"ALTER TABLE public.{r['table']} "
            f"DROP CONSTRAINT IF EXISTS {r['table']}_{r['column']}_fkey;"
        )
        print(
            f"ALTER TABLE public.{r['table']} "
            f"ADD CONSTRAINT {r['table']}_{r['column']}_fkey "
            f"FOREIGN KEY ({r['column']}) REFERENCES {'public.profiles' if r['target']=='profiles' else 'auth.users'}(id) "
            f"ON DELETE {r['on_delete']};"
        )
        if r["not_null"]:
            print(f"ALTER TABLE public.{r['table']} ALTER COLUMN {r['column']} SET NOT NULL;")
        else:
            print(f"ALTER TABLE public.{r['table']} ALTER COLUMN {r['column']} DROP NOT NULL;")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
