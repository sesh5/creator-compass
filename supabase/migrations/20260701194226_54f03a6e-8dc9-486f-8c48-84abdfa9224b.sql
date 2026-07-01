
-- Scope profiles policy to authenticated role only (defense in depth)
DROP POLICY IF EXISTS "Users manage own profile" ON public.profiles;
CREATE POLICY "Users manage own profile" ON public.profiles
  FOR ALL TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- cached_research: remove authenticated read; access is only via server-side service role
DROP POLICY IF EXISTS "Authenticated can read research" ON public.cached_research;
REVOKE SELECT, INSERT, UPDATE, DELETE ON public.cached_research FROM authenticated;

-- youtube_api_cache: remove authenticated read; access is only via server-side service role
DROP POLICY IF EXISTS "Authenticated can read api cache" ON public.youtube_api_cache;
REVOKE SELECT, INSERT, UPDATE, DELETE ON public.youtube_api_cache FROM authenticated;
