## Why the search is failing

Two things stack on top of each other:

1. **YouTube `search` quota is still exhausted** (same daily quota as the earlier 429). Free-text queries like `Vj Siddhu Vlogs` go through `search.list`, which costs 100 units per call — your project is out for the day.
2. **`searchCompetitorByQuery` silently swallows that quota error** through the same `isQuota` `break` we added to `searchChannelsByQuery`. It returns `[]`, so the UI shows the misleading "No channels found for …" instead of the real "quota exhausted" message.

On top of that, the input has a stray leading apostrophe (`'Vj Siddhu Vlogs`) and no `@`, so even with quota we never try the cheap `channels.list?forHandle=` path (1 unit, separate quota bucket).

## Fix

Edit `src/lib/discovery.functions.ts` → `searchCompetitorByQuery`:

1. **Sanitize input** — trim, strip leading non-alphanumerics (e.g. `'`, `@`, whitespace).
2. **Try the cheap handle path first** for any single-token-ish query: build a handle candidate by removing spaces (`VjSiddhuVlogs`) and call `getChannelByHandle`. This uses `channels.list` (1 unit, not subject to the exhausted Search quota), so it'll succeed today for queries that resemble a handle.
3. **Detect quota on the search fallback** — wrap `searchChannelsByQuery` so it re-throws quota errors here (instead of swallowing). Surface a clear toast: "YouTube search quota is exhausted for today — try pasting the channel URL or @handle instead."
4. **Improve the empty-state copy** in `src/routes/_authenticated/discover.tsx` to hint the user can paste a URL or `@handle` when free-text search is unavailable.

### Technical detail

- `src/lib/youtube.server.ts` already exports `getChannelByHandle`. We'll call it directly from `searchCompetitorByQuery` for the handle-candidate path so we don't depend on `searchChannelsByQuery` returning ids.
- To re-throw quota from the search fallback without changing `searchChannelsByQuery` (which legitimately needs to swallow quota during bulk discovery), we'll call `searchChannelsByQuery` and, if it returns `[]` AND the cache for that query is empty, additionally try a direct `ytFetch`-like probe — simpler: add an internal flag-less variant by catching the error in a small inline `try` that calls a new tiny helper `searchChannelsByQueryStrict` exported from `youtube.server.ts` that does NOT swallow quota. Manual search re-throws so the user sees the real reason.

No UI restructuring beyond the empty-state text. Watchlist/discovery flows are unchanged.