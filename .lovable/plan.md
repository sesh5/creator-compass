# Teardown Chat with Web Search

Add an inline "Ask about this channel" chat at the bottom of the teardown page. Messages are saved per channel in the database. The AI has both the teardown context and a web search tool it can call to answer questions like "why did Archa Cooking blow up?".

## 1. Database (migration)

New table `public.teardown_chats`:
- `id uuid pk`
- `user_id uuid not null` (owner, RLS-scoped)
- `channel_id text not null` (YouTube channel id from the teardown route)
- `role text` check in (`user`, `assistant`)
- `content text`
- `created_at timestamptz default now()`
- index on `(user_id, channel_id, created_at)`

Standard grants + RLS: user can select/insert/delete only their own rows (`auth.uid() = user_id`). No anon access.

## 2. Web search connector

Web search will use **Firecrawl** (Lovable's default web connector), called server-side. The workspace does not have a Firecrawl connection linked yet, so the plan will prompt to connect Firecrawl when the chat backend is wired. No API key input needed from the user — it's a one-click connector link.

## 3. Server: `src/lib/teardown-chat.functions.ts`

Three auth-protected server functions (all `.middleware([requireSupabaseAuth])`):

- `listTeardownMessages({ channel_id })` — returns the user's saved messages for that channel, oldest first.
- `clearTeardownMessages({ channel_id })` — deletes the thread (for a "Clear chat" button).
- `sendTeardownMessage({ channel_id, message })` — the main handler:
  1. Load cached teardown row from `cached_research` for `channel_id` (channel_name, subs, teardown_json, outlier_videos_json). Fail gracefully if missing ("Run the teardown first").
  2. Load prior messages from `teardown_chats` for this user + channel.
  3. Insert the new user message.
  4. Call Lovable AI Gateway (`google/gemini-3-flash-preview`) via `@ai-sdk/openai-compatible` + `generateText` with:
     - System prompt: role = YouTube growth analyst; here is the teardown JSON + top outliers for `<channel_name>`; use the `web_search` tool when the user asks about current events, virality reasons, recent news, or anything outside the teardown; cite sources inline as `[domain](url)` when web is used.
     - Full message history + new user message.
     - A single `web_search` tool defined with `tool()` + Zod input `{ query: string }`, `execute` calls Firecrawl `search` (limit 5, markdown scrape) via `FIRECRAWL_API_KEY`, returns compact `[{title,url,snippet}]`.
     - `stopWhen: stepCountIs(50)`.
  5. Insert the assistant reply. Return `{ reply, usedWebSearch: boolean, sources: [...] }`.

Non-streaming (simpler, matches the existing teardown page pattern that already uses `useQuery` + `useServerFn`). Errors (429 rate limit, 402 credits, Firecrawl failures) surface as toast messages.

## 4. UI: `src/components/TeardownChat.tsx`

New component, rendered as the last section on `src/routes/_authenticated/teardown.$channelId.tsx`:

- Section header "Ask about this channel" with a small "Clear" button.
- Message list styled with the existing `surface-card` system:
  - User messages: right-aligned bubble using `bg-primary text-primary-foreground`.
  - Assistant messages: no bubble, rendered as markdown via `react-markdown` + `remark-gfm` (install if missing) so links from web search render.
  - If assistant used web search, show a small "Sources" row with domain chips linking out.
- Empty state suggests example prompts: "Why is this channel growing?", "What's their best-performing hook?", "Why did their latest video blow up?" (clicking fills the input).
- Composer: `<Textarea>` + `<Button>` submit; Enter to send, Shift+Enter for newline; disabled while awaiting reply; shows a "Thinking…" shimmer row.
- Data: `useQuery(["teardown-chat", channelId], listTeardownMessages)` for history; `useMutation(sendTeardownMessage)` optimistically appends the user message and invalidates the query on success.

Mobile responsive; textarea autofocuses after each reply.

## 5. Wire-up

- `src/routes/_authenticated/teardown.$channelId.tsx`: import and render `<TeardownChat channelId={channelId} channelName={data.channel_name} />` after the outliers section.
- No changes to the existing teardown fetch or cache.

## Technical notes

- Chat only shows on the teardown page. History is scoped to `(user_id, channel_id)` — switching projects or channels shows the right thread automatically.
- The AI does not re-run the teardown; it reads from the `cached_research` row that already exists.
- `LOVABLE_API_KEY` is already provisioned. `FIRECRAWL_API_KEY` will be injected once the Firecrawl connector is linked in build step.
- No new tables besides `teardown_chats`. No schema changes to `cached_research`.
- Follows the existing `surface-card` / `brand-gradient` design tokens — no hardcoded colors.

## Out of scope

- Streaming responses (can add later with `streamText` + a chat API route if desired).
- Cross-channel chat / a global assistant.
- Editing or branching past messages.
