# Why the Results page shows only dashes

Your row is real and correct in the database:

- `status = "made"`, `video_id = "KZf5_hgchyI"` (57k views, valid)
- `views / subs_gained / outlier_score` are all still `null`

I confirmed the YouTube API returns proper stats for that video ID and the cache has never been populated for it. So the numbers are missing for one reason: **the "made → measured" step only runs when you click "Refresh stats"**, and that click hasn't happened yet for this row. Nothing is broken — it just hasn't been asked to fetch.

Clicking **Refresh stats** right now will fill in views, subs gained, and outlier. But requiring a manual click for every new video is bad UX and is exactly why it looks "not giving any result".

# Fix

Make measurement automatic when a concept is marked as made, and make refresh feedback louder.

## Changes

1. `src/lib/plan.functions.ts` — `markConceptMade`
   - After the UPDATE to `status = "made"`, immediately fetch the video via `getVideoById(vid)` and, if found, write `views`, `outlier_score`, `subs_gained`, `measured_at`, and flip status to `"measured"` in the same request.
   - Wrap in try/catch so a YouTube API hiccup still leaves the row as `"made"` (the manual refresh remains as a fallback).
   - Return `{ ok: true, measured: boolean }` so the client can toast "Marked and measured" vs "Marked — will measure on next refresh".

2. `src/lib/plan.functions.ts` — `measureMyOutcomes`
   - When it processes a row but `getVideoById` returns `null` (deleted / private / typo), log that specific outcome id and include a `skipped: number` count in the return value.
   - Return `{ measured, skipped }`.

3. `src/routes/_authenticated/results.tsx`
   - Update the toast to include skipped: `Measured X · Skipped Y` when `skipped > 0`, and switch to an error toast when `measured === 0 && rows > 0`.

4. Plan page (wherever `markConceptMade` is called) — surface the new `measured` flag in the success toast. No behavior change if it's already generic.

## Not changing

- Database schema, RLS, or the YouTube cache layer.
- The manual "Refresh stats" button (kept as a safety net for older rows and for view-count updates over time).
- The teardown chat feature.

## After deploying

Existing row `92abb938…` will still be `"made"` with null metrics until you click **Refresh stats** once. All new "mark as made" actions will populate metrics instantly.
