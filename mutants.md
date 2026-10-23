# r9b edit-card paint kill

Painted values only. Main SHA `0898c3b9` fill is `255,255,255` (`--g-surface` on the edit interior). Main border is `228,228,231` (`--g-line`, painted on the 2nd-card left edge).

| it() | index.css mutated | red |
|---|---|---|
| `P1b-edit-paint: edit card fill and 4 edge midpoints match main 0898c3b9 at 768/1024/1280` `src/components/layout/p1Dashboard.chromium.kill.tsx:2932` | `:13203` `background: var(--dashboard-home-sheet)` → `transparent` | `:2944` AssertionError (fill vs main white) |
| same it() | `:13204` `border: 1px solid var(--dashboard-home-line)` sides dropped | `:2949` AssertionError (left/right vs main line) |
| `P1b-edit-paint mutant: missing fill or side borders go red` `:2955` | same real write + look-dist rebuild, then revert | `:2999` fill / `:3010` sides |
