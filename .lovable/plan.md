# Tighter peer band + strict niche filter

## Goals
1. Peer band is exactly **2x–5x** the user's current subscriber count, at every tier. No more wider tiers for small creators, no more 200K–2M for a 100K user.
2. Results are **strictly on-niche**. A travel creator must never see ASMR, cooking, etc.
3. Return **as many on-niche peers in band as possible** — no artificial cap of 15.
4. Updating the subs pill instantly re-tiers the band and re-runs niche filtering.

## 1. Strict 2x–5x band

**`src/lib/discovery.functions.ts`** — replace `pickPeerBand` with:
```ts
export function pickPeerBand(userSubs: number) {
  const base = Math.max(userSubs, 1_000); // floor for brand-new creators so band isn't 0–0
  const lo = base * 2;
  const hi = base * 5;
  return { lo, hi, label: `${formatK(lo)}–${formatK(hi)}` };
}
```
- 100K → 200K–500K
- 500K → 1M–2.5M
- 1M → 2M–5M
- 0 / <1K → treated as 1K → 2K–5K (effectively "show small channels"); label reads "2K–5K"

Edge case: for a true 0-sub user the 2K–5K band is too small to be useful. Add one fallback only for `userSubs < 1_000`: use a fixed **10K–100K** "starter" band with the label "Starter peers (10K–100K)". From 1K upward, strict 2x–5x applies, no exceptions.

Remove the existing ±50% "widen if thin" fallback — user explicitly wants the band to be non-negotiable.

## 2. Strict niche filter (the hard part)

Right now YouTube search returns whatever is loosely related to the keywords, which is why ASMR Truck Camping showed up for a travel creator. Two-layer filter:

### Layer A — keyword presence in channel metadata
Before AI, keep only channels whose `title + description` contains at least one of the niche keywords (case-insensitive, whole-word match). This is cheap, deterministic, and removes obvious off-niche results.

### Layer B — AI niche-match gate
Use Lovable AI (`google/gemini-3-flash-preview`, already wired) to classify each surviving channel as `on_niche: true|false` for the user's niche keywords, returning the same `niche_tag` and `why_watch` it already returns today. One batched call, same shape as the existing tagging call — just adds an `on_niche` boolean per channel. Drop any channel where `on_niche === false`.

If the AI call fails, fall back to Layer A only (still strict on keyword presence) so the user never sees an off-niche channel even when AI is down.

### Pipeline
1. Pull up to 50 search results per niche-keywords query (current behavior).
2. **NEW**: also issue a second search using the *primary* keyword alone (first keyword in `niche_keywords`) for an additional 50 candidates, then dedupe by channel id. Cost: one extra cached search call. Reason: combined keyword string ("travel vlog adventure") often misses pure-niche channels that only match one term.
3. `getChannelsBulk` to hydrate stats.
4. Filter by strict 2x–5x band.
5. Filter by Layer A (keyword in title/description).
6. Filter by Layer B (AI on_niche gate).
7. Rank by composite score (unchanged: 0.6 ratio + 0.4 subs).
8. Return **all** survivors (no slice cap). Cap at a safety ceiling of 30 to keep the UI responsive, but no min-15-then-stop.

## 3. UI updates

**`src/routes/_authenticated/discover.tsx`**
- Header description becomes: `"Strict 2x–5x peers for ${formatNumber(user_subs)} subs — ${band_label}, on-niche only."`
- Show result count: `"Suggested competitors (${competitors.length})"`
- When 0 survive: empty state copy `"No on-niche channels found in the ${band_label} range. Try refining your niche keywords (Onboarding) — more specific terms give better matches."`
- The existing SubsEditor already invalidates `["profile"]` and clears discover results — no change needed; new tiering will apply on the next "Find competitors" click.

## 4. Re-tier on subs update — already wired
`SubsEditor.onSuccess` already invalidates profile and clears prior discover data. No additional change.

## Not changing
- DB schema.
- YouTube cache TTLs.
- Onboarding flow.
- Plan / Teardown / Results pages.
- `SubsEditor` component itself.

## Technical notes
- `band.lo`/`band.hi` are now always non-zero (floor at 1K base), so no divide-by-zero or empty-band edge case at the SQL/UI level.
- AI prompt change: ask for `{ on_niche: boolean, niche_tag, why_watch }` keyed by id. Parse defensively — any channel missing from the response is dropped (treated as off-niche).
- Quota impact: +1 search call per Discover click (100 units) → ~200 units per click. Still well within free-tier daily quota (10,000 units = 50 clicks/day).
- Safety ceiling 30 prevents one ultra-broad niche (e.g. "vlog") from rendering hundreds of cards.
