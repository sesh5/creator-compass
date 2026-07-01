CREATE TABLE public.teardown_chats (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  channel_id text NOT NULL,
  role text NOT NULL CHECK (role IN ('user','assistant')),
  content text NOT NULL,
  sources_json jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX teardown_chats_user_channel_created_idx
  ON public.teardown_chats (user_id, channel_id, created_at);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.teardown_chats TO authenticated;
GRANT ALL ON public.teardown_chats TO service_role;

ALTER TABLE public.teardown_chats ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users select own teardown chats"
  ON public.teardown_chats FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users insert own teardown chats"
  ON public.teardown_chats FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users delete own teardown chats"
  ON public.teardown_chats FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);