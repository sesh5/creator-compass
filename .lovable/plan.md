## Add "Pitch your own idea" to the Plan page

Keep the existing auto-generated 5-concept plan exactly as is. Add a second box on `/plan` where the user types a place, topic, or rough idea, and the AI returns tailored video concepts shaped like the existing ones — so they can mix self-driven ideas with the auto plan.

### 1. New server function — `src/lib/plan.functions.ts`

Add `generateConceptsFromIdea` (createServerFn, POST, `requireSupabaseAuth`):
- Input (Zod): `{ idea: string (3–300 chars), count?: 1–5 default 3 }`.
- Loads the user's profile (niche keywords, subscriber_count, goal) and their watchlist's cached outliers (same as `generatePlan`) so suggestions stay on-niche and sized to the creator.
- Calls Lovable AI (`google/gemini-3-flash-preview`) with a prompt that:
  - Anchors strictly to the user's niche keywords (travel stays travel — no cooking).
  - Takes the user's idea (e.g. "Lisbon", "night trains in Europe", "solo female travel in Japan") as the seed.
  - Returns JSON: `{ analysis: { fit, demand, difficulty, audience }, concepts: Concept[] }` where `Concept` matches the existing shape (`hook, titles[3], thumbnail_brief, target_keyword, why_now`).
  - `analysis` is short, plain-language: will this gain subscribers in their niche? what angle works best? what to avoid?
- Does NOT write to `content_plans` or `concept_outcomes` — these are exploratory suggestions. User can copy them or (future) promote into the plan.
- Returns `{ analysis, concepts }` to the client.

### 2. UI — `src/routes/_authenticated/plan.tsx`

Add a new section above the existing plan list (or between header and list):

```
┌─ Pitch your own idea ────────────────────────────┐
│ Textarea: "A place, topic, or angle you're       │
│ thinking about (e.g. 'Lisbon food tour',         │
│ 'night trains in Europe')"                       │
│ [Slider 1–5 concepts]  [Analyze & suggest]       │
└──────────────────────────────────────────────────┘
```

After submit:
- Show `analysis` as a small surface card (fit / demand / difficulty / best angle).
- Render returned concepts using the **same `ConceptCard` visual** (no "I made this" footer, since they aren't tracked outcomes — pass an `outcome={undefined}` and hide the input block). Add a `<Copy>` button per concept (already present in `ConceptCard`).

State: `useMutation` calling the new server fn; show loader, toast errors, keep last result visible until user submits again.

### 3. Minimal `ConceptCard` tweak

`ConceptCard` already hides the "I made this" block when `outcome` is undefined. Confirm and reuse as-is — no structural changes.

### Not changing
- Auto-plan generation, outcomes, measurement, DB schema, discovery, onboarding.
- `ConceptCard` shape (just reused with `outcome={undefined}`).

### Technical notes
- Niche enforcement mirrors the discovery niche gate: prompt explicitly instructs the model to refuse off-niche ideas and instead reframe the user's input through their niche keywords; if it can't, return `concepts: []` with an `analysis.fit` explanation.
- AI JSON parsed defensively (regex extract `{…}`, `JSON.parse`, fallback error toast).
- One AI call per submit. No new tables, no migrations.
- Server fn lives next to `generatePlan` and reuses the same `Concept` type export.
