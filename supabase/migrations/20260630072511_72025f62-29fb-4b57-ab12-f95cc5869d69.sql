
-- Profiles
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users ON DELETE CASCADE,
  email TEXT,
  channel_url TEXT,
  channel_id TEXT,
  channel_title TEXT,
  subscriber_count INTEGER DEFAULT 0,
  niche_keywords TEXT[] DEFAULT '{}',
  goal TEXT,
  onboarded BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own profile" ON public.profiles FOR ALL USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

-- Watchlist
CREATE TABLE public.watchlist (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  competitor_channel_id TEXT NOT NULL,
  channel_name TEXT NOT NULL,
  subscriber_count INTEGER DEFAULT 0,
  thumbnail_url TEXT,
  niche_tag TEXT,
  why_watch TEXT,
  added_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, competitor_channel_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.watchlist TO authenticated;
GRANT ALL ON public.watchlist TO service_role;
ALTER TABLE public.watchlist ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own watchlist" ON public.watchlist FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Shared YouTube API cache (any signed-in user can read, server writes)
CREATE TABLE public.youtube_api_cache (
  cache_key TEXT PRIMARY KEY,
  payload JSONB NOT NULL,
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.youtube_api_cache TO authenticated;
GRANT ALL ON public.youtube_api_cache TO service_role;
ALTER TABLE public.youtube_api_cache ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated can read api cache" ON public.youtube_api_cache FOR SELECT TO authenticated USING (true);

-- Cached AI teardowns + outlier videos
CREATE TABLE public.cached_research (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id TEXT NOT NULL UNIQUE,
  channel_name TEXT,
  subscriber_count INTEGER,
  teardown_json JSONB,
  outlier_videos_json JSONB,
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.cached_research TO authenticated;
GRANT ALL ON public.cached_research TO service_role;
ALTER TABLE public.cached_research ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated can read research" ON public.cached_research FOR SELECT TO authenticated USING (true);

-- Content plans
CREATE TABLE public.content_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  concepts_json JSONB NOT NULL,
  source_competitors TEXT[],
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.content_plans TO authenticated;
GRANT ALL ON public.content_plans TO service_role;
ALTER TABLE public.content_plans ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own plans" ON public.content_plans FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Concept outcomes (the moat)
CREATE TABLE public.concept_outcomes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  content_plan_id UUID REFERENCES public.content_plans ON DELETE CASCADE,
  concept_index INTEGER NOT NULL,
  concept_snapshot JSONB NOT NULL,
  niche_keywords TEXT[],
  status TEXT NOT NULL DEFAULT 'suggested' CHECK (status IN ('suggested','made','measured')),
  video_url TEXT,
  video_id TEXT,
  views INTEGER,
  subs_gained INTEGER,
  outlier_score NUMERIC,
  marked_made_at TIMESTAMPTZ,
  measured_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.concept_outcomes TO authenticated;
GRANT ALL ON public.concept_outcomes TO service_role;
ALTER TABLE public.concept_outcomes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own outcomes" ON public.concept_outcomes FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Benchmark targets
CREATE TABLE public.benchmark_targets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  channel_id TEXT NOT NULL,
  channel_name TEXT NOT NULL,
  added_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, channel_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.benchmark_targets TO authenticated;
GRANT ALL ON public.benchmark_targets TO service_role;
ALTER TABLE public.benchmark_targets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own targets" ON public.benchmark_targets FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Benchmark snapshots
CREATE TABLE public.benchmark_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  target_channel_id TEXT NOT NULL,
  week_start DATE NOT NULL,
  target_videos_json JSONB,
  user_videos_json JSONB,
  comparison_json JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.benchmark_snapshots TO authenticated;
GRANT ALL ON public.benchmark_snapshots TO service_role;
ALTER TABLE public.benchmark_snapshots ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own snapshots" ON public.benchmark_snapshots FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Title lab runs
CREATE TABLE public.title_lab_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  input_title TEXT NOT NULL,
  suggestions_json JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.title_lab_runs TO authenticated;
GRANT ALL ON public.title_lab_runs TO service_role;
ALTER TABLE public.title_lab_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own title runs" ON public.title_lab_runs FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Auto-create profile + updated_at triggers
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE TRIGGER trg_profiles_updated BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_outcomes_updated BEFORE UPDATE ON public.concept_outcomes
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, email) VALUES (NEW.id, NEW.email)
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END; $$;

CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
