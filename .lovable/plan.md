# Fuller ranked competitor discovery

## Goals
1. Peer discovery keeps the **2x–5x core**, but includes the practical nearby ladder so a 100K creator can see peers around **177K–600K**, not only one 201K result.
2. Results are **strictly on-niche**. A travel creator must never see ASMR, cooking, etc.
3. Return **as many on-niche peers in band as possible** — no artificial one-result or 15-result cap.
4. Updating the subs pill instantly re-tiers the band and re-runs niche filtering.

## 1. Dynamic growth ladder

For `userSubs >= 1K`, use a 2x–5x core for labeling and ranking context, but search 1.75x–6x so channels like 177K and 600K are not wrongly discarded for a 100K creator. For `userSubs < 1K`, use the existing starter band.

## 2. Strict niche filter (the hard part)

Right now YouTube search returns whatever is loosely related to the keywords, which is why ASMR Truck Camping showed up for a travel creator. Two-layer filter:

### Layer A — keyword presence in channel metadata
Before AI, keep only channels whose `title + description` contains at least one of the niche keywords (case-insensitive, whole-word match). This is cheap, deterministic, and removes obvious off-niche results.

### Layer B — AI niche-match gate
Use Lovable AI (`google/gemini-3-flash-preview`, already wired) to classify each surviving channel as `on_niche: true|false` for the user's niche keywords, returning the same `niche_tag` and `why_watch` it already returns today. One batched call, same shape as the existing tagging call — just adds an `on_niche` boolean per channel. Drop any channel where `on_niche === false`.

If the AI call fails, fall back to Layer A only (still strict on keyword presence) so the user never sees an off-niche channel even when AI is down.

### Pipeline
1. Pull multiple pages of channel search results across niche-specific query variants.
2. Search by both relevance and view count, then dedupe by channel id. Reason: one top-50 YouTube search often misses most eligible channels.
3. `getChannelsBulk` to hydrate stats.
4. Filter by strict 2x–5x band.
5. Filter by Layer A (keyword in title/description).
6. Filter by Layer B (AI on_niche gate).
7. Rank by composite score (unchanged: 0.6 ratio + 0.4 subs).
8. Return **all** survivors found, ranked by subscriber count and views.

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
