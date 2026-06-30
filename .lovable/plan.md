# Fix: Discover only returns one channel

## Root cause
`src/lib/discovery.functions.ts` filters YouTube search results to **100K–1M subs** when the user has 0 or <1,000 subs. Most niche search results fall outside that band (either >1M or <100K), so only one channel survived.

## Change
Widen the band to **50K–2M subs** for creators with 0 or <1,000 subs. Keeps mega-channels out, keeps tiny no-signal channels out, but gives ~3–5x more surviving candidates.

### File: `src/lib/discovery.functions.ts`
Replace the two `userSubs === 0` and `userSubs < 1_000` branches so both use:
```ts
filtered = channels.filter(
  (c) => c.subscriberCount >= 50_000 && c.subscriberCount <= 2_000_000,
);
```
Leave the `>= 1,000 subs` branch (dynamic `lo`/`hi` based on user size) unchanged.

### Copy tweak: `src/routes/_authenticated/discover.tsx`
Update the description shown when `subscriber_count` is falsy from "small but growing channels in your niche" to "achievable peers in your niche (50K–2M subs)" so the UI matches the new band.

## Not changing
- Number of YouTube search results requested (still 30) — no extra API quota.
- Sort order (still by view/sub ratio, best peers first).
- Logic for established creators (≥1,000 subs).
