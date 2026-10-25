# Grafter motion spec (v1, Phase 1b)

Motion in Grafter is **feedback, not decoration**. Each animation tells the user that something happened, where it went, or that the app is working. Benchmarks: Linear and Superhuman (fast, decelerating, never bouncy) and Stripe Dashboard (quiet crossfades). If an animation doesn't answer "what just happened?", cut it.

- Prototype: `after/html/motion-prototype.html` runs every interaction below with real CSS transitions, driven only by tokens.
- Frame strips (Playwright, DPR 2, transitions paused at fixed timestamps): `after/motion/<interaction>-strip.png`, plus `after/motion/reduced-motion-strip.png`.
- Tokens: `spec/tokens.css` §9 (motion) and §9b (toast, save). This file supersedes `design-system.md` §8 wherever they differ.

## 1. Tokens
| Token | Value | Use |
|---|---|---|
| `--g-dur-press` | 80ms | press feedback |
| `--g-dur-fast` | 120ms | hover, colour, border; label crossfades |
| `--g-dur-base` | 200ms | toast in, tab indicator, scrim in, popover |
| `--g-dur-slow` | 280ms | phone sheet open |
| `--g-dur-exit` | 180ms | sheet / drawer close |
| `--g-dur-success-hold` | 1200ms | how long "Saved" shows |
| `--g-toast-hold` / `--g-toast-hold-action` | 5000ms / 15000ms | toast lifetime (D13) |
| `--g-skeleton-delay` / `--g-skeleton-cycle` | 300ms / 1400ms | skeleton appears after 300ms; shimmer period |
| `--g-ease-standard` | `cubic-bezier(.2,0,0,1)` | state changes that stay on screen |
| `--g-ease-enter` | `cubic-bezier(.16,1,.3,1)` | things arriving (decelerate hard) |
| `--g-ease-exit` | `cubic-bezier(.4,0,1,1)` | things leaving (accelerate away) |
| `--g-motion-distance` | 1 (0 when reduced) | multiplies every translate distance |

**Rules**
1. Animate only `transform`, `opacity`, `background-color`, `border-color`, `color` and `box-shadow`. Never width, height, top/left or `transition: all`.
2. Entering takes longer than leaving (280 open, 180 close; 200 in, 150 out).
3. No bounce, no overshoot, no scale on press, no parallax, no spinning icons except the loading spinner.
4. Nothing blocks input. A tap during an exit animation acts on the next state at once.
5. Interrupted transitions reverse from where they are (CSS transitions do this for free; don't use keyframes for reversible states).
6. Header, bottom nav and sheet chrome never animate on route change. Only the content area crossfades.

## 2. Interactions

### 2.1 Sheet open and close (phone bottom sheet, desktop drawer)
| | Property | From → to | Duration | Easing | Delay |
|---|---|---|---|---|---|
| Phone sheet open | `transform` | `translateY(100% + 8px)` → `0` | 280ms | enter | 0 |
| Scrim open | `opacity` | 0 → 1 (`--g-scrim`) | 200ms | standard | 0 |
| Phone sheet close | `transform` | `0` → `translateY(100% + 8px)` | 180ms | exit | 0 |
| Scrim close | `opacity` | 1 → 0 | 150ms | exit | 0 |
| Desktop drawer open | `transform`, `opacity` | `translateX(24px)`, 0 → `0`, 1 | 240ms | enter | 0 |
| Desktop drawer close | `transform`, `opacity` | reverse | 180ms | exit | 0 |

`visibility` flips to hidden at the end of close (`transition: visibility 0s linear 180ms`) so the closed sheet can't take focus. Focus moves into the sheet on open and back to the trigger on close. Strip: `sheet-open-strip.png`, `sheet-close-strip.png`. At 120ms the sheet is ~90% up (enter easing front-loads the travel), so it feels instant without a jump.

### 2.2 Toast in and out (D13 navy chip)
| | Property | From → to | Duration | Easing |
|---|---|---|---|---|
| In | `opacity`, `transform` | 0, `translateY(8px)` → 1, `0` | 200ms | enter |
| Out | `opacity`, `transform` | 1, `0` → 0, `translateY(4px)` | 150ms | exit |
| Stack shift (2nd toast arrives) | `transform` | old position → new | 200ms | standard |

- Position (D13): phone bottom-centre, 12px above the tab bar and safe area; laptop bottom-right, 24px from the edges. Max 3 stacked, 8px apart; a 4th replaces the oldest.
- Navy `--g-bg-inverse` chip, cream text, **one** action in `--g-primary-on-inverse`. No icons in the chip, no green, no close button needed for success (it times out); errors get a close button.
- Lifetime: 5s without an action, **15s with Open or Undo** (D13), errors stay until dismissed. Timers pause on hover and focus-within, and while the page is hidden.
- Error chip: same navy chip with a 4px `--g-warning` (#A4410A) left accent (`inset 4px 0 0`), never a red chip; `role="alert"`.
- Strips: `toast-in-strip.png` (phone), `toast-out-strip.png`, `toast-in-laptop-strip.png` (laptop, with the error accent).

### 2.3 Save feedback (button loading, then success)
| t (ms) | State | What changes | Duration / easing |
|---|---|---|---|
| 0 | Press | background → `--g-primary-active` | 80ms standard |
| 80 | Loading | label crossfades to spinner + "Saving…"; background `--g-primary-hover`; button `aria-busy="true"`, disabled | 120ms standard |
| reply | Success | spinner crossfades to tick + "Saved" | 150ms standard |
| reply + 1200 | Rest | "Saved" crossfades back to the label | 120ms standard |

- **Width is locked** to the resting width (`min-width` set from the label), so the button never jumps.
- **Skip the loading state if the reply comes within 150ms**: go straight to "Saved". This stops a spinner flash on fast saves.
- **Success stays blue.** The tick and "Saved" sit on the same primary button; there's no green (lock: green only on status pills). A polite live region announces "Saved".
- Failure: back to the label at once, then the field error (or an error toast with **Retry** for background saves). The button never turns red.
- Spinner: 16px, 2px ring, `rotate` 800ms linear infinite (1200ms under reduced motion).
- Strip: `save-strip.png` at 0, 60, 120, 200, 320, 760, 1000 and 2100ms; the server replies at 700ms in the prototype.

### 2.4 Tab change
| | Property | Duration | Easing |
|---|---|---|---|
| Indicator (2px, `--g-ink-900`) | `transform: translateX(x) scaleX(w)` on a 1px bar | 200ms | standard |
| Tab label colour | `color` muted → ink | 120ms | standard |
| Panel | new panel `opacity` 0 → 1; old panel removed at once (no slide, no height animation) | 150ms | standard |

Strip: `tab-strip.png`. On the phone 2×2 segmented tabs there is no indicator; the selected cell's background changes in 120ms.

### 2.5 Hover and press
| | Property | Duration | Easing |
|---|---|---|---|
| Hover in/out | `background-color`, `border-color`, `color` | 120ms | standard |
| Press | `background-color` only (`--g-bg-pressed` / `--g-primary-active`) | 80ms | standard |
| Release | back to hover | 120ms | standard |
| Focus ring | appears instantly | 0ms | n/a |

No scale, no shadow growth, no translate. Hover styles apply only under `@media (hover: hover)`, so phones never get stuck hover states. Strip: `hover-press-strip.png`.

### 2.6 Skeleton shimmer and swap to content
- Skeletons appear only if loading takes over **300ms**, and once shown stay at least 300ms.
- Shimmer: a `--g-paper-50` highlight band, 30% of the bar width, sweeps `transform: translateX(-100%) → translateX(440%)` over each `--g-paper-200` bar; 1400ms linear infinite, starting after the 300ms delay. All bars share one timeline (same start), so the sweep reads as one light pass, not a ripple.
- Skeleton → content: crossfade `opacity` 150ms standard. Layout must not shift (skeleton rows match real row heights; see `design-system.md` §9.1).
- Strip: `skeleton-strip.png` at 0, 300, 650, 1000, 1350 and 1700ms.

### 2.7 Also covered (no strip)
| Interaction | Duration | Easing | Properties |
|---|---|---|---|
| Popover / select menu open | 160ms | enter | `opacity`, `translateY(-4px → 0)` |
| Popover close | 100ms | exit | `opacity` |
| Route / page change | 150ms | standard | content-area `opacity` only |
| Row expand (accordion) | 0ms height; content fades 120ms | standard | `opacity` (no height animation) |
| Drag on the week board | chip follows pointer with no easing; drop target bg 120ms | standard | `background-color` |

## 3. prefers-reduced-motion: reduce
The tokens switch automatically (`tokens.css`): `--g-motion-distance: 0`, `--g-dur-press: 0`, `--g-dur-base` / `--g-dur-slow` 120ms, `--g-dur-exit` 100ms, `--g-skeleton-cycle: 0`.

| Interaction | Reduced behaviour |
|---|---|
| Sheet / drawer | Fades in place (`opacity` 120ms), no travel. Scrim fades as normal. |
| Toast | Fades in place, 120ms in and out. Lifetimes are unchanged (15s for Open/Undo). |
| Save | Same states and timings for the label; the spinner keeps turning (it shows progress) at 1200ms per turn. |
| Tab | Indicator jumps (0ms); panel fades 120ms. |
| Hover / press | Colour changes stay (they aren't motion); press is instant. |
| Skeleton | Static `--g-paper-200`, no shimmer. |
| Smooth scroll (settings chips, "jump to") | `scroll-behavior: auto` (matches `companySettingsNavScrollBehavior`). |

Safety net in the base layer: `@media (prefers-reduced-motion: reduce) { *, *::before, *::after { animation-iteration-count: 1 !important; scroll-behavior: auto !important; } .g-spinner { animation-iteration-count: infinite !important; } }`.

Strip: `reduced-motion-strip.png` (sheet, toast, save, tab and skeleton under emulated reduced motion).

## 4. Acceptance for motion PRs
- Every transition names its properties (lint: no `transition: all`, no `transition` on width/height/top/left).
- Frame strips at 0, 60, 120, 200 and 320ms match this file within one frame (±16ms).
- With reduced motion emulated (`page.emulateMedia({ reducedMotion: 'reduce' })`), no element moves more than 0px during any transition.
- No layout shift during skeleton → content (CLS 0 for the swapped region).
