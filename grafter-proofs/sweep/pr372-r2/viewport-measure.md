# PR372 r2 viewport measure

Measured on Chromium (`document.documentElement.scrollWidth` vs `window.innerWidth`). Clipped text is scoped to the time-entry form / date field surfaces (overflow+ellipsis or horizontally outside the viewport). Error column is the time-entry reversed-time `role=alert` in the sticky footer; quote/invoice/expense date fields have no inline error in this PR.

| Surface | Width | scrollWidth | innerWidth | scrollWidth ≤ innerWidth | no clipped text | error visible without scroll (375) | frame |
|---|---:|---:|---:|:---:|:---:|:---:|---|
| Time entry form · view (ledger) | 375 | 375 | 375 | pass | pass | none | `grafter-proofs/sweep/pr372-r2/time-entry-view-375.png` |
| Time entry form · edit (reversed error) | 375 | 375 | 375 | pass | pass | visible | `grafter-proofs/sweep/pr372-r2/time-entry-edit-375.png` |
| Quote date · view (Valid until) | 375 | 375 | 375 | pass | pass | none | `grafter-proofs/sweep/pr372-r2/quote-view-375.png` |
| Quote date · edit (Valid Until) | 375 | 375 | 375 | pass | pass | none | `grafter-proofs/sweep/pr372-r2/quote-edit-375.png` |
| Invoice date · view (Due) | 375 | 375 | 375 | pass | pass | none | `grafter-proofs/sweep/pr372-r2/invoice-view-375.png` |
| Invoice date · edit (Due Date) | 375 | 375 | 375 | pass | pass | none | `grafter-proofs/sweep/pr372-r2/invoice-edit-375.png` |
| Expense date · view (list Date) | 375 | 375 | 375 | pass | pass | none | `grafter-proofs/sweep/pr372-r2/expense-view-375.png` |
| Expense date · edit (Date field) | 375 | 375 | 375 | pass | pass | none | `grafter-proofs/sweep/pr372-r2/expense-edit-375.png` |
| Time entry form · view (ledger) | 390 | 390 | 390 | pass | pass | n/a | `grafter-proofs/sweep/pr372-r2/time-entry-view-390.png` |
| Time entry form · edit (reversed error) | 390 | 390 | 390 | pass | pass | visible | `grafter-proofs/sweep/pr372-r2/time-entry-edit-390.png` |
| Quote date · view (Valid until) | 390 | 390 | 390 | pass | pass | n/a | `grafter-proofs/sweep/pr372-r2/quote-view-390.png` |
| Quote date · edit (Valid Until) | 390 | 390 | 390 | pass | pass | n/a | `grafter-proofs/sweep/pr372-r2/quote-edit-390.png` |
| Invoice date · view (Due) | 390 | 390 | 390 | pass | pass | n/a | `grafter-proofs/sweep/pr372-r2/invoice-view-390.png` |
| Invoice date · edit (Due Date) | 390 | 390 | 390 | pass | pass | n/a | `grafter-proofs/sweep/pr372-r2/invoice-edit-390.png` |
| Expense date · view (list Date) | 390 | 390 | 390 | pass | pass | n/a | `grafter-proofs/sweep/pr372-r2/expense-view-390.png` |
| Expense date · edit (Date field) | 390 | 390 | 390 | pass | pass | n/a | `grafter-proofs/sweep/pr372-r2/expense-edit-390.png` |
| Time entry form · view (ledger) | 1024 | 1024 | 1024 | pass | pass | n/a | `grafter-proofs/sweep/pr372-r2/time-entry-view-1024.png` |
| Time entry form · edit (reversed error) | 1024 | 1024 | 1024 | pass | pass | visible | `grafter-proofs/sweep/pr372-r2/time-entry-edit-1024.png` |
| Quote date · view (Valid until) | 1024 | 1024 | 1024 | pass | pass | n/a | `grafter-proofs/sweep/pr372-r2/quote-view-1024.png` |
| Quote date · edit (Valid Until) | 1024 | 1024 | 1024 | pass | pass | n/a | `grafter-proofs/sweep/pr372-r2/quote-edit-1024.png` |
| Invoice date · view (Due) | 1024 | 1024 | 1024 | pass | pass | n/a | `grafter-proofs/sweep/pr372-r2/invoice-view-1024.png` |
| Invoice date · edit (Due Date) | 1024 | 1024 | 1024 | pass | pass | n/a | `grafter-proofs/sweep/pr372-r2/invoice-edit-1024.png` |
| Expense date · view (list Date) | 1024 | 1024 | 1024 | pass | pass | n/a | `grafter-proofs/sweep/pr372-r2/expense-view-1024.png` |
| Expense date · edit (Date field) | 1024 | 1024 | 1024 | pass | pass | n/a | `grafter-proofs/sweep/pr372-r2/expense-edit-1024.png` |
| Time entry form · view (ledger) | 1280 | 1280 | 1280 | pass | pass | n/a | `grafter-proofs/sweep/pr372-r2/time-entry-view-1280.png` |
| Time entry form · edit (reversed error) | 1280 | 1280 | 1280 | pass | pass | visible | `grafter-proofs/sweep/pr372-r2/time-entry-edit-1280.png` |
| Quote date · view (Valid until) | 1280 | 1280 | 1280 | pass | pass | n/a | `grafter-proofs/sweep/pr372-r2/quote-view-1280.png` |
| Quote date · edit (Valid Until) | 1280 | 1280 | 1280 | pass | pass | n/a | `grafter-proofs/sweep/pr372-r2/quote-edit-1280.png` |
| Invoice date · view (Due) | 1280 | 1280 | 1280 | pass | pass | n/a | `grafter-proofs/sweep/pr372-r2/invoice-view-1280.png` |
| Invoice date · edit (Due Date) | 1280 | 1280 | 1280 | pass | pass | n/a | `grafter-proofs/sweep/pr372-r2/invoice-edit-1280.png` |
| Expense date · view (list Date) | 1280 | 1280 | 1280 | pass | pass | n/a | `grafter-proofs/sweep/pr372-r2/expense-view-1280.png` |
| Expense date · edit (Date field) | 1280 | 1280 | 1280 | pass | pass | n/a | `grafter-proofs/sweep/pr372-r2/expense-edit-1280.png` |

All rows pass: **true**.
