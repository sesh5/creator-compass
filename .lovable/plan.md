## Three fixes

### 1. Discover: return ~10 competitors and search more thoroughly

Problem: only 3 results, and obvious channels (e.g. "Nate Herk | AI Automation", ~900K) are missed.

Changes in `src/lib/discovery.functions.ts`:
- **Broaden search**: expand `buildSearchQueries` to use multi-word combos of niche keywords (e.g. "AI automation", "agentic AI", "n8n agents", "Claude agents") plus per-keyword variants. Pull each query at higher `maxResults` and add `order=date` as a third pass so newer fast-growing channels surface alongside `relevance` + `viewCount`.
- **Looser band, then re-rank**: widen the ladder to `0.5x – 8x` user subs (still skip the user's own channel) so 900K shows up for a 500K creator. Keep the 2x–5x "core" label for UI context, but don't drop out-of-core peers.
- **Softer keyword gate**: keep the strict regex pre-filter, but if the AI niche classifier is available, skip the regex gate and let the AI judge fit (the AI already rejects off-niche). This recovers channels whose title/description doesn't literally contain the keyword (e.g. "Nate Herk").
- **Return up to 12**: after AI on-niche filtering + ranking, `slice(0, 12)`. UI shows count as before.
- **Better AI prompt**: in the niche-gate prompt, give 3–4 concrete on-niche / off-niche examples derived from the keywords so borderline tech-creator channels are kept.

### 2. What to Make: deeper, less generic "Analyze & suggest"

Problem: pitching "agentic systems using Claude Opus" returns generic concepts.

Changes in `src/lib/plan.functions.ts` (`generateConceptsFromIdea`):
- **Use a stronger model for this call only**: switch from `google/gemini-3-flash-preview` to `google/gemini-3.1-pro-preview` for idea analysis. Plan auto-generation stays on flash for speed/cost.
- **Inject richer context**: include up to 8 competitors (currently 10) AND their top 5 outliers each (currently 3), plus each competitor's `niche_tag` and subscriber count. Include the project's subscriber count and goal explicitly.
- **Sharper prompt**: require the AI to (a) name 2 specific competitor videos the concept is modeled on, (b) explain the angle vs. the obvious take, (c) propose a differentiated hook (no "Top 5…", no "Ultimate guide…"), (d) flag if the pitch is too broad and narrow it. Add a "reject generic phrasing" rule with examples.
- **Add `analysis.angle`**: a new field summarizing the specific angle taken (shown as a small line above each concept). Extend `IdeaAnalysis` type and the UI render in `plan.tsx`.

### 3. Persist Discover results and Plan idea-analysis across tab switches

Today: switching tabs unmounts the route component and the in-memory `useMutation` result is lost.

Approach: keep the results in the TanStack Query cache (already provided at the router) so they survive route unmounts within a session. No DB writes.

Changes:
- **Discover (`src/routes/_authenticated/discover.tsx`)**: replace the `useMutation` for `discoverCompetitors` with `useQuery({ queryKey: ["discover-results", activeProjectId], queryFn: () => discoverFn(), enabled: false, staleTime: Infinity, gcTime: Infinity })`. The "Find competitors" button calls `refetch()`. Result reads from `query.data`. Already invalidated on project switch by `ProjectSwitcher` (`qc.removeQueries({ queryKey: ["discover-results"] })`).
- **Plan idea pitcher (`src/routes/_authenticated/plan.tsx`)**: replace the `IdeaPitcher` `useMutation` + local `result` state with a `useQuery({ queryKey: ["idea-analysis", activeProjectId], enabled: false, staleTime: Infinity, gcTime: Infinity })` driven by a ref-held latest `{ idea, count }`. Button triggers `refetch()`. Result persists across navigation. Cleared on project switch (add `qc.removeQueries({ queryKey: ["idea-analysis"] })` to `ProjectSwitcher`).
- No localStorage, no DB table — purely in-memory cache, which matches the user's ask ("don't make me search again" within the session).

### Files touched
- `src/lib/discovery.functions.ts` — query expansion, looser band, AI-gate-when-available, return 12, better classifier prompt
- `src/lib/plan.functions.ts` — pro model for `generateConceptsFromIdea`, richer context, stricter prompt, `analysis.angle`
- `src/routes/_authenticated/discover.tsx` — `useQuery` cache instead of mutation
- `src/routes/_authenticated/plan.tsx` — `useQuery` cache for IdeaPitcher, render `analysis.angle`
- `src/components/ProjectSwitcher.tsx` — also clear `["idea-analysis"]` on switch

### Not changing
- DB schema, RLS, auth, onboarding, watchlist, results page, teardown, plan auto-generation model, `ConceptCard` structure.
