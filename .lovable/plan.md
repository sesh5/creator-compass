Add the Google site verification meta tag to the sitewide `head()` in `src/routes/__root.tsx` (this project has no `index.html` — TanStack Start injects head tags via the route `head()` API).

Add one entry to the `meta` array:

```tsx
{ name: "google-site-verification", content: "dSxvkgUq7rTxlUE0Nxj7FUsv9F3lOh90Rngv0c-QZiI" }
```

Placed in the root route so it renders on every page, which is what Google Search Console expects for verification.