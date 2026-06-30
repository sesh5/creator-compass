## Goals

1. Let the user add any YouTube channel to their watchlist — even one that isn't in the suggested list (search by handle, channel URL, or channel name).
2. Remove the small external-link arrow on each suggested-competitor card (the icon circled in the screenshot).

## 1. Manual competitor search

**UI** — on the Discover page, above "Suggested competitors", add a search bar:

```text
[ Add a competitor manually                                  ] [ Search ]
   Paste a YouTube URL, @handle, or channel name
```

Behavior:
- Input accepts: `https://youtube.com/@handle`, `https://youtube.com/channel/UC...`, a bare `@handle`, a bare `UC…` ID, or a free-text channel name.
- On submit, show up to ~5 matching channels as small result cards (thumbnail, name, subs) with **Add to watchlist** and **Teardown** buttons. Same card style as suggested competitors, minus the ranking number and "why watch" blurb (we just show the channel — no AI verdict needed for an explicit user pick).
- Results persist on the page like the existing discovery results (TanStack Query cache) so leaving and returning to Discover keeps them visible.
- Adding from here writes to the same watchlist as suggested competitors and shows up immediately in "Your watchlist" above.

**Server** — new `searchCompetitorByQuery` server function in `src/lib/discovery.functions.ts`:
- If the input parses as a channel ID/handle/URL → call existing `getChannelByHandleOrUrl` and return that single channel.
- Otherwise → call `searchChannelsByQuery(query, 5)` then `getChannelsBulk` to hydrate name/subs/thumbnail.
- Returns the same shape as suggested competitors (`channel_id`, `channel_name`, `subscriber_count`, `thumbnail_url`) with `niche_tag` and `why_watch` left empty so the watchlist insert still works.
- Reuses the YouTube cache + the quota-friendly error handling already in `youtube.server.ts`, so a quota-exhausted day surfaces the same friendly toast.

## 2. Remove the external-link icon

In `src/routes/_authenticated/discover.tsx`, delete the ghost `<Button>` with the `ExternalLink` icon at the end of each suggested-competitor card's action row (and drop the now-unused `ExternalLink` import). The Teardown button stays; the YouTube-open shortcut goes away on those cards.

The same `ExternalLink` buttons on the **watchlist** cards and on the **teardown** page are out of scope — only the suggested-competitor cards are touched.

## Technical detail

- New file additions: none. Edits only to `src/lib/discovery.functions.ts` (new server fn) and `src/routes/_authenticated/discover.tsx` (search UI + remove icon).
- No DB schema changes; watchlist table already accepts arbitrary `competitor_channel_id`.
- Manual-search results live in a separate `useQuery` key (`["manual-search", query]`) so they don't disturb the existing suggested-competitor cache.
