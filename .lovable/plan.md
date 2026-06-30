# Analytics page — "What's Working"

A new authenticated page that summarises growth across the active project's `concept_outcomes`. Aggregate-only — does not duplicate the per-concept list on Results.

## Scope
- Scoped to `profiles.active_project_id` (resolved server-side, same pattern as other pages).
- Read-only. Uses only `public.concept_outcomes`. No new tables, no schema changes.
- Honors existing RLS (user's own rows).

## Files to add / change

1. **`src/lib/analytics.functions.ts`** (new) — one authenticated server fn `getProjectAnalytics`:
   - Resolves active project for the current user (reuse `getActiveProject` helper or inline equivalent).
   - Returns short-circuit `{ hasProject: false }` if none.
   - Single `select` of needed columns from `concept_outcomes` for that `project_id`:
     `status, views, subs_gained, outlier_score, video_url, video_id, concept_snapshot, measured_at`.
   - Aggregates in JS (dataset is small, one project's concepts) and returns a typed DTO:
     - `funnel`: `{ suggested, made, measured, madeRate, measuredRate }`
     - `totals`: `{ totalViews, totalSubsGained, avgOutlier, measuredCount }`
     - `keywords`: array of `{ keyword, avgViews, count }` for `status='measured'`, grouped by `concept_snapshot.target_keyword`, sorted by avgViews desc, top 10.
     - `greatestHits`: top 20 measured rows sorted by views desc with `{ id, hook, views, subs_gained, outlier_score, video_url, video_id }`.

2. **`src/routes/_authenticated/analytics.tsx`** (new) — page component:
   - Uses `useServerFn` + `useQuery` (no protected loader, consistent with other authed pages).
   - `PageHeader` eyebrow "Analytics", title "What's Working", short description.
   - Four sections in order:
     1. **Idea funnel** — 3 stat cards (Suggested / Made / Measured) + 2 conversion cards (Made rate, Measured rate). Grid: 1 col mobile, 2-3 sm, 5 lg.
     2. **Outcome totals** — 3 headline cards (Total views, Subs gained, Avg outlier score) using `formatNumber`.
     3. **What to make more of** — horizontal bar chart via `ChartContainer` + Recharts `BarChart layout="vertical"`, YAxis=keyword, Bar=avgViews, custom tooltip showing avgViews + concept count. Uses `hsl(var(--primary))` token. Empty state if no measured concepts.
     4. **Greatest hits** — ranked list (Card with divided rows). Each row: rank, hook (truncate), small meta line with views / subs gained / outlier score, external-link button to `video_url`.
   - Loading: `Skeleton` blocks per section. Error: inline alert with retry.
   - Empty states using `EmptyState`:
     - No active project → "Create or pick a project to see analytics."
     - No suggested concepts → "Generate ideas on the What to make page to get started."
     - No measured concepts → "Make and measure your first suggested video to start tracking growth." (shown inside sections 2-4; funnel still renders with zeros.)

3. **`src/components/AppShell.tsx`** — add nav entry:
   - Import `BarChart3` from `lucide-react`.
   - Insert `{ to: "/analytics", label: "Analytics", icon: BarChart3 }` after Results (or between Results and Plan — placing after Results to keep Discover→Plan→Results flow, with Analytics as the reflective endpoint).

## Technical notes
- `concept_snapshot` is `jsonb`; cast in JS as `{ hook?: string; target_keyword?: string; titles?: string[] }`. Group keywords with a trimmed-lowercase key, display the first-seen original casing. Skip rows with empty/missing keyword (bucket as "Untagged" only if count>0, optional).
- `avgOutlier` ignores null values; divide by count of non-null.
- Conversion rates guard against divide-by-zero (return 0).
- All colors via existing tokens (`bg-card`, `text-muted-foreground`, `hsl(var(--primary))`, etc.) — no hardcoded hex.
- Mobile: stat grid collapses to 1-2 cols; bar chart container `h-[320px]`; greatest-hits rows stack meta below hook on small screens.

## Out of scope
- No new DB tables, migrations, RLS, or indexes.
- No edits to Results page.
- No date-range filter (can be added later).
