#!/usr/bin/env python3
"""Replace hardcoded app CSS font families with --g-font-* tokens.

PDF, email, and report files stay on their own faces until D1/D3.
"""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

REPLACEMENTS = [
    ("font-family: 'Source Sans 3', system-ui, sans-serif", "font-family: var(--g-font-ui)"),
    ('font-family: "Source Sans 3", system-ui, sans-serif', "font-family: var(--g-font-ui)"),
    ("font-family: Rajdhani, sans-serif", "font-family: var(--g-font-title)"),
    ("font-family: 'Rajdhani', sans-serif", "font-family: var(--g-font-title)"),
    ("font-family: Inter, system-ui, sans-serif", "font-family: var(--g-font-sans)"),
    ("font-family: 'Inter', system-ui, sans-serif", "font-family: var(--g-font-sans)"),
    ("font-family: 'JetBrains Mono', 'Courier New', monospace", "font-family: var(--g-font-mono)"),
    ('font-family: "JetBrains Mono", ui-monospace, monospace', "font-family: var(--g-font-mono)"),
    ("font-family: 'JetBrains Mono', ui-monospace, monospace", "font-family: var(--g-font-mono)"),
    ("font-family: 'JetBrains Mono', monospace", "font-family: var(--g-font-mono)"),
    ("font-family: Newsreader, Georgia, serif", "font-family: var(--g-font-sans)"),
    ("font-family: 'Newsreader', Georgia, serif", "font-family: var(--g-font-sans)"),
]

SKIP_DIR_PARTS = {
    "reports",
    "node_modules",
    "dist",
}

SKIP_FILES = {
    "src/reports/commercial/CommercialDocumentPdf.tsx",
    "src/reports/shared/fonts.ts",
    "src/pages/quotesPdfLook.test.ts",
    "src/pages/invoicesPdfLook.test.ts",
    "src/lib/sendQuote.ts",
    "src/lib/sendInvoice.ts",
}


def should_skip(path: Path) -> bool:
    rel = path.relative_to(ROOT).as_posix()
    if rel in SKIP_FILES:
        return True
    parts = set(path.parts)
    if "reports" in parts and path.suffix in {".ts", ".tsx"}:
        return True
    return False


def apply(text: str) -> tuple[str, int]:
    count = 0
    for old, new in REPLACEMENTS:
        n = text.count(old)
        if n:
            text = text.replace(old, new)
            count += n
    return text, count


def main() -> None:
    targets = [ROOT / "src/index.css"]
    targets.extend(ROOT.glob("src/**/*Look.test.ts"))
    targets.extend(ROOT.glob("src/**/*Theme.test.ts"))
    targets.extend(ROOT.glob("src/**/*.test.ts"))
    targets.extend(ROOT.glob("src/**/*.test.tsx"))
    seen = set()
    changed = []
    for path in targets:
        if not path.is_file():
            continue
        resolved = path.resolve()
        if resolved in seen:
            continue
        seen.add(resolved)
        if should_skip(path):
            continue
        original = path.read_text()
        updated, count = apply(original)
        if "Fraunces|Geist" in updated:
            updated = updated.replace("|Fraunces|Geist", "|Fraunces")
        if count or updated != original:
            path.write_text(updated)
            changed.append((path.relative_to(ROOT).as_posix(), count))
    css_hits = apply((ROOT / "src/index.css").read_text())[1]
    print(f"index.css remaining-old-families after write: {css_hits}")
    for rel, count in changed:
        print(f"{count:4d}  {rel}")


if __name__ == "__main__":
    main()
