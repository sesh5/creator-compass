## Problem

The external-link arrow on each competitor card uses `<a target="_blank">`. Inside Lovable's preview iframe this can still resolve inside the iframe, and YouTube refuses to be framed → `ERR_BLOCKED_BY_RESPONSE` ("www.youtube.com is blocked").

## Fix

Replace the anchor with a button that calls `window.open(url, "_blank", "noopener,noreferrer")`. `window.open` always creates a top-level browser tab, bypassing the iframe, so YouTube loads normally. Keep the icon and tooltip unchanged.

Apply the same fix everywhere a YouTube channel/video link is rendered:

- `src/routes/_authenticated/discover.tsx` — the `ExternalLink` button on each suggested-competitor card.
- `src/routes/_authenticated/teardown.$channelId.tsx` — any "Open on YouTube" / video links (audit and convert).
- `src/routes/_authenticated/results.tsx` — any video links that point to youtube.com (audit and convert).

No other behavior changes. Watchlist, teardown, and routing stay the same.

### Technical detail

```tsx
<Button
  size="sm"
  variant="ghost"
  onClick={() =>
    window.open(
      `https://www.youtube.com/channel/${c.channel_id}`,
      "_blank",
      "noopener,noreferrer",
    )
  }
  aria-label="Open on YouTube"
>
  <ExternalLink className="w-3 h-3" />
</Button>
```
