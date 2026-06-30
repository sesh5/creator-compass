# Multi-niche projects

Right now, a user has exactly one niche stored on their profile, and every watchlist row, content plan, concept outcome, benchmark, and teardown is scoped only by `user_id`. We'll introduce a **Project** as the new scoping unit (one project = one niche + one channel context), let the user create and switch between projects, and scope all existing data to the active project.

## 1. Data model

New table `public.projects`:
- `id uuid pk`, `user_id uuid → auth.users`, `name text` (e.g. "Travel vlog", "Tech trends")
- `channel_url`, `channel_id`, `channel_title`, `subscriber_count int`
- `niche_keywords text[]`, `goal` (same enum as today)
- `is_default bool`, `created_at`, `updated_at`
- RLS: owner-only (user_id = auth.uid()). GRANT select/insert/update/delete to authenticated, all to service_role.

Add `project_id uuid not null references public.projects(id) on delete cascade` to:
- `watchlist`, `content_plans`, `concept_outcomes`, `benchmark_targets`, `benchmark_snapshots`, `cached_research`, `title_lab_runs`

Migration backfill:
- For each existing profile with `onboarded = true`, insert one project named after their first niche keyword (or "My channel"), copy channel + niche fields, mark `is_default = true`.
- Update existing rows in the tables above to point to that project.
- Then set `project_id` NOT NULL and add indexes on `(user_id, project_id)`.

Profile keeps `id/email/onboarded` plus a new `active_project_id uuid` (nullable, references projects). Niche/channel fields stay on the profile for now (read-only legacy) but new code reads from the active project.

## 2. Server functions

New `src/lib/projects.functions.ts`:
- `listProjects()` — returns user's projects + which is active.
- `createProject({ name, channel_url?, subscriber_count?, niche_keywords, goal })` — runs the existing YouTube channel lookup (same logic as `completeOnboarding`), inserts row, sets it active.
- `updateProject({ id, ...fields })` — rename, edit niche, edit subscriber count.
- `deleteProject({ id })` — blocks deleting the last project.
- `setActiveProject({ id })` — updates `profiles.active_project_id`.

Update every existing server fn that touches scoped tables to:
- Resolve the active project (`profiles.active_project_id`, fall back to default), and
- Filter / insert with `project_id` instead of just `user_id`.

Files touched: `discovery.functions.ts`, `plan.functions.ts`, `teardown.functions.ts`, `profile.functions.ts` (subs editor now writes to active project), `routes/api/public/hooks/measure-outcomes.ts` (scope by project_id stored on the outcome row).

`completeOnboarding` becomes "create first project + mark onboarded" — same UX, but it inserts a project row instead of writing niche fields onto the profile.

## 3. UI

**Project switcher in `AppShell` header** (left of the SubsEditor pill):
- Dropdown showing current project name + niche tag, list of other projects, "+ New project" item, "Manage projects" link.
- Switching calls `setActiveProject` then `queryClient.invalidateQueries()` so Discover/Plan/Results/Teardown refetch under the new scope.
- `SubsEditor` continues to show subs but now edits the active project's subscriber_count.

**New route `/projects`** (`src/routes/_authenticated/projects.tsx`):
- Card grid of projects: name, niche keywords, subs, channel title, "Set active / Active", "Edit", "Delete".
- "Create new project" opens a modal reusing the onboarding form fields (channel URL optional, subs, niche keywords, goal).

**Onboarding flow** stays the same visually, but on submit it creates the user's first project and sets it active.

**Header nav** gets a small "Projects" link (or only in the dropdown footer to keep nav tight — TBD, default: in dropdown).

**Discover / Plan / Results / Teardown**: no UI rewrites. They already read `profile.subscriber_count` / `profile.niche_keywords`; we swap those reads to come from the active project (returned alongside profile by `getMyProfile`, or via a new `getActiveProject` query).

## 4. Niche enforcement stays per-project

All existing strict-niche prompts (discovery niche-gate, plan generator, IdeaPitcher) keep working — they just read keywords from the active project instead of the profile. Switching projects gives a completely different competitor list, plan, and idea analysis.

## 5. Not changing

- `ConceptCard`, discovery ladder math (2x–5x), AI prompts (only the source of niche keywords changes), onboarding form fields, auth, RLS model for existing tables (just adds project_id scoping).
- No cross-project sharing, no team members, no per-project theming.

## Technical notes

- One migration creates `projects`, backfills, adds `project_id` columns + FKs + indexes, sets `active_project_id` on profiles. Run table creation → GRANT → ALTER ENABLE RLS → policies, in that order.
- `getMyProfile` returns `{ profile, activeProject, projects: [{id,name}] }` so the header can render the switcher without a second round-trip.
- All scoped queries gain `.eq('project_id', activeProjectId)`; inserts include `project_id`.
- `concept_outcomes` measurement webhook reads `project_id` from the outcome row itself — no caller change.
- Deleting a project cascades watchlist/plans/outcomes/etc. Confirm dialog warns about this.

## Files

New:
- `supabase/migrations/<ts>_projects.sql`
- `src/lib/projects.functions.ts`
- `src/components/ProjectSwitcher.tsx`
- `src/components/ProjectFormDialog.tsx`
- `src/routes/_authenticated/projects.tsx`

Edited:
- `src/components/AppShell.tsx` (mount switcher)
- `src/components/SubsEditor.tsx` (write to active project)
- `src/lib/profile.functions.ts` (return active project; onboarding creates project)
- `src/lib/discovery.functions.ts`, `src/lib/plan.functions.ts`, `src/lib/teardown.functions.ts` (project scoping)
- `src/routes/_authenticated/onboarding.tsx` (calls createProject under the hood)
- `src/routes/api/public/hooks/measure-outcomes.ts` (uses outcome.project_id)
