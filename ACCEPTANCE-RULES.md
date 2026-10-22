# Acceptance rules

Permanent. Do not drop these when cutting a PR.

## Build before vitest

`gates.sh` runs `npm run build`, then `npx vitest run --maxWorkers=2`, then the Chromium dist-CSS suite (`s2Shell.chromium.kill.tsx`) in the same run. The Chromium suite still runs if the main vitest step has the known product-test failures.

Dist-reading kills (for example `overlaySearchCancel` and the S2 shell Chromium suite) read `dist/assets/*.css`. If vitest runs without a fresh build in that same run, those kills are skipped or they read a stale bundle and go green for the wrong reason.

Run:

```
./gates.sh
```

Not `npx vitest run` alone when proving a PR that includes a dist-reading kill.
