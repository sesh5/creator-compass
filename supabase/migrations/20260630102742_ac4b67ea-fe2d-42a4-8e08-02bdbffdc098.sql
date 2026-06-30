
-- 1. Create projects table
CREATE TABLE public.projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  channel_url text,
  channel_id text,
  channel_title text,
  subscriber_count integer NOT NULL DEFAULT 0,
  niche_keywords text[] NOT NULL DEFAULT '{}',
  goal text NOT NULL DEFAULT 'first_1k',
  is_default boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.projects TO authenticated;
GRANT ALL ON public.projects TO service_role;

ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own projects" ON public.projects
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER trg_projects_updated BEFORE UPDATE ON public.projects
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_projects_user ON public.projects(user_id);

-- 2. Add active_project_id to profiles
ALTER TABLE public.profiles ADD COLUMN active_project_id uuid REFERENCES public.projects(id) ON DELETE SET NULL;

-- 3. Backfill: one default project per onboarded profile, copying their fields
INSERT INTO public.projects (user_id, name, channel_url, channel_id, channel_title, subscriber_count, niche_keywords, goal, is_default)
SELECT
  p.id,
  COALESCE(NULLIF(p.channel_title, ''), NULLIF((p.niche_keywords)[1], ''), 'My channel'),
  p.channel_url, p.channel_id, p.channel_title,
  COALESCE(p.subscriber_count, 0),
  COALESCE(p.niche_keywords, '{}'),
  COALESCE(p.goal, 'first_1k'),
  true
FROM public.profiles p
WHERE p.onboarded = true;

UPDATE public.profiles pr
SET active_project_id = pj.id
FROM public.projects pj
WHERE pj.user_id = pr.id AND pj.is_default = true;

-- 4. Add project_id to all scoped tables (nullable, then backfill, then NOT NULL)
ALTER TABLE public.watchlist ADD COLUMN project_id uuid REFERENCES public.projects(id) ON DELETE CASCADE;
ALTER TABLE public.content_plans ADD COLUMN project_id uuid REFERENCES public.projects(id) ON DELETE CASCADE;
ALTER TABLE public.concept_outcomes ADD COLUMN project_id uuid REFERENCES public.projects(id) ON DELETE CASCADE;
ALTER TABLE public.benchmark_targets ADD COLUMN project_id uuid REFERENCES public.projects(id) ON DELETE CASCADE;
ALTER TABLE public.benchmark_snapshots ADD COLUMN project_id uuid REFERENCES public.projects(id) ON DELETE CASCADE;
ALTER TABLE public.title_lab_runs ADD COLUMN project_id uuid REFERENCES public.projects(id) ON DELETE CASCADE;

-- Backfill from default project per user
UPDATE public.watchlist t SET project_id = pj.id
  FROM public.projects pj WHERE pj.user_id = t.user_id AND pj.is_default = true;
UPDATE public.content_plans t SET project_id = pj.id
  FROM public.projects pj WHERE pj.user_id = t.user_id AND pj.is_default = true;
UPDATE public.concept_outcomes t SET project_id = pj.id
  FROM public.projects pj WHERE pj.user_id = t.user_id AND pj.is_default = true;
UPDATE public.benchmark_targets t SET project_id = pj.id
  FROM public.projects pj WHERE pj.user_id = t.user_id AND pj.is_default = true;
UPDATE public.benchmark_snapshots t SET project_id = pj.id
  FROM public.projects pj WHERE pj.user_id = t.user_id AND pj.is_default = true;
UPDATE public.title_lab_runs t SET project_id = pj.id
  FROM public.projects pj WHERE pj.user_id = t.user_id AND pj.is_default = true;

-- Delete any orphaned rows (users without onboarded profile)
DELETE FROM public.watchlist WHERE project_id IS NULL;
DELETE FROM public.concept_outcomes WHERE project_id IS NULL;
DELETE FROM public.content_plans WHERE project_id IS NULL;
DELETE FROM public.benchmark_targets WHERE project_id IS NULL;
DELETE FROM public.benchmark_snapshots WHERE project_id IS NULL;
DELETE FROM public.title_lab_runs WHERE project_id IS NULL;

ALTER TABLE public.watchlist ALTER COLUMN project_id SET NOT NULL;
ALTER TABLE public.content_plans ALTER COLUMN project_id SET NOT NULL;
ALTER TABLE public.concept_outcomes ALTER COLUMN project_id SET NOT NULL;
ALTER TABLE public.benchmark_targets ALTER COLUMN project_id SET NOT NULL;
ALTER TABLE public.benchmark_snapshots ALTER COLUMN project_id SET NOT NULL;
ALTER TABLE public.title_lab_runs ALTER COLUMN project_id SET NOT NULL;

-- Replace per-user unique constraints with per-project unique constraints
ALTER TABLE public.watchlist DROP CONSTRAINT IF EXISTS watchlist_user_id_competitor_channel_id_key;
ALTER TABLE public.watchlist ADD CONSTRAINT watchlist_project_competitor_unique UNIQUE (project_id, competitor_channel_id);

ALTER TABLE public.benchmark_targets DROP CONSTRAINT IF EXISTS benchmark_targets_user_id_channel_id_key;
ALTER TABLE public.benchmark_targets ADD CONSTRAINT benchmark_targets_project_channel_unique UNIQUE (project_id, channel_id);

CREATE INDEX idx_watchlist_project ON public.watchlist(project_id);
CREATE INDEX idx_content_plans_project ON public.content_plans(project_id);
CREATE INDEX idx_concept_outcomes_project ON public.concept_outcomes(project_id);
CREATE INDEX idx_benchmark_targets_project ON public.benchmark_targets(project_id);
CREATE INDEX idx_benchmark_snapshots_project ON public.benchmark_snapshots(project_id);
CREATE INDEX idx_title_lab_runs_project ON public.title_lab_runs(project_id);
