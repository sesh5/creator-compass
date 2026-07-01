# URL validation + live-updating views

Two additions to the Results/Plan flow.

## 1. Verify the YouTube URL before saving

Right now `markConceptMade` only checks the URL matches a regex — anything that looks like `youtube.com/watch?v=XXXXXXXXXXX` is accepted, even if the video doesn't exist. The app then quietly stores a dead ID and Results shows dashes forever.

Fix: after parsing the ID, call `getVideoById(vid)` inside `markConceptMade` and treat "no video returned" as a hard error, not a silent skip.

- If the API returns nothing → throw `"We couldn't find that video on YouTube. Double-check the URL — it needs to be a public video you own."`
- If it returns a video → include its `title` and `thumbnail` in the response, and the Plan page shows a small confirmation toast: `Locked in: "<video title>"` so the user sees exactly what got attached before trusting the numbers.
- Same-turn: auto-measure (already added last turn) uses the video we just fetched — no second API round trip.

No new UI dialog is needed; the toast + error message is enough to prevent fake/typo URLs.

## 2. Live-updating views on the Results page

You picked **"Every time you open Results"**. Implementation:

- On the Results page, add a `useEffect` that calls `measureMyOutcomes` once on mount (in addition to the existing manual "Refresh stats" button).
- Debounce with a client-side timestamp in `sessionStorage` (key `results:lastAutoMeasure`) so opening the page twice in the same hour doesn't spam the YouTube API. The manual button always runs regardless.
- The refresh runs quietly in the background — no spinner overlay. When it finishes, the `outcomes` query invalidates and the cards re-render with fresh numbers. Toast only on failure.

### Bypass the stale YouTube cache

`getVideoById` currently caches results in `youtube_api_cache` for 2 hours (`ytFetch` cache), so even after "Refresh stats" the numbers can be up to 2 hours stale. Fix by adding a `fresh?: boolean` option to `getVideoById`:

- When called from `measureMyOutcomes`, pass `fresh: true` → skip the cache read, still write the result back so other callers get a fresh entry.
- When called from `markConceptMade` (verify step), keep the cache (a video just uploaded is fine to cache for 2h).

## Files touched

- `src/lib/youtube.server.ts` — add `fresh` param to `getVideoById` (and to `ytFetch` — read path only).
- `src/lib/plan.functions.ts` — `markConceptMade` throws on unresolved video and returns `{ ok, measured, video_title }`; `measureMyOutcomes` calls `getVideoById(id, { fresh: true })`.
- `src/routes/_authenticated/plan.tsx` — toast now shows the confirmed video title.
- `src/routes/_authenticated/results.tsx` — mount-time silent auto-refresh with 1-hour sessionStorage throttle.

## Not changing

- No cron job, no new secrets, no schema changes.
- Manual "Refresh stats" button stays.
- Teardown page and chat feature untouched.
