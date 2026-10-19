# Acceptance rules

Permanent. Do not drop these when cutting a PR.

## Build before vitest

`gates.sh` runs `npm run build` immediately before `npx vitest run --maxWorkers=2` in the same run.

Dist-reading kills (for example `overlaySearchCancel`) read `dist/assets/*.css`. If vitest runs without a fresh build in that same run, those kills are skipped or they read a stale bundle and go green for the wrong reason.

Run:

```
./gates.sh
```

Not `npx vitest run` alone when proving a PR that includes a dist-reading kill.
