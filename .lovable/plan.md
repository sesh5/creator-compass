# Dynamic subscriber count + ranked competitors

## Goal
Let the creator update their subscriber count at any time, and have Discover always return 10–15 ranked peers sized to the latest count — so as they grow, the competitor set levels up with them.

## 1. Editable subscriber count (UI)

**`src/components/AppShell.tsx`** — add a compact "Subs: 1,250 ✎" pill in the top nav, next to the theme/logout buttons. Click opens a small popover with a number input + Save button. On save, calls a new `updateSubscriberCount` server fn, invalidates the `["profile"]` query, and toasts "Updated — competitor tier refreshed."

**`src/routes/_authenticated/discover.tsx`** — also show an inline "Update subs" link in the page header so it's discoverable on the screen where it matters most.

## 2. Server fn

**`src/lib/profile.functions.ts`** — add:
```ts
export const updateSubscriberCount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ subscriber_count: z.number().int().min(0).max(100_000_000) }).parse(d))
  .handler(async ({ data, context }) => {
    await context.supabase.from("profiles")
      .update({ subscriber_count: data.subscriber_count })
      .eq("id", context.userId);
    return { ok: true };
  });
```
No schema change — `profiles.subscriber_count` already exists.

## 3. Tiered, ranked competitor discovery (10–15 results)

**`src/lib/discovery.functions.ts`** — replace current filter with a size-tier band tied to the user's current subscriber count, then rank inside the band:

| User subs | Peer band (subs) |
| --- | --- |
| 0 | 10K – 250K |
| 1–999 | 25K – 500K |
| 1K – 10K | 100K – 1M |
| 10K – 100K | 500K – 5M |
| 100K – 1M | user×2 – user×20 |
| ≥1M | user×1.5 – user×10 |

Pipeline:
1. Pull 50 search results (was 30) for more raw candidates, still one cached search call.
2. Filter to the band.
3. Rank by composite score: `0.6 * normalized(viewCount/subscriberCount) + 0.4 * normalized(subscriberCount)` — rewards both outlier performance (good signal for new creator) and proximity to the top of the band (aspirational targets just above them).
4. Return top 15; if band yields <10, widen band by ±50% once and re-rank.
5. Sort order in the UI: highest composite score first.

UI label in `discover.tsx` page header updates dynamically: "Peers in the {bandLabel} range, ranked for {formatNumber(subs)} subs."

## 4. Auto-refresh on subscriber change
- `updateSubscriberCount` mutation `onSuccess` invalidates `["profile"]` AND `["watchlist"]` queries, and clears `discoverMut.data` so the user sees a fresh "Find competitors" prompt with the new tier.

## Not changing
- DB schema (column exists).
- YouTube cache TTLs (already 6h–3d).
- Plan / Teardown / Results routes.
- Onboarding flow (still captures initial subs).

## Technical notes
- Tier function lives in `discovery.functions.ts` as a pure helper `pickPeerBand(userSubs)` returning `{ lo, hi, label }` so the UI can read the same label via a tiny GET server fn or by computing client-side from the profile.
- Composite score normalization uses min/max within the current candidate set so it's robust to niche differences.
- Quota impact: one extra ~50-result search per Discover click vs. 30 — still 100 units, same as before (search cost is per call, not per result).
