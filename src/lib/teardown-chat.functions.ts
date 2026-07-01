import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const ChannelInput = z.object({ channel_id: z.string().min(1).max(64) });
const SendInput = z.object({
  channel_id: z.string().min(1).max(64),
  message: z.string().min(1).max(2000),
});

export type ChatSource = { title: string; url: string; domain: string };
export type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  sources: ChatSource[] | null;
  created_at: string;
};

export const listTeardownMessages = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => ChannelInput.parse(d))
  .handler(async ({ data, context }): Promise<ChatMessage[]> => {
    const { supabase, userId } = context;
    const { data: rows, error } = await supabase
      .from("teardown_chats")
      .select("id, role, content, sources_json, created_at")
      .eq("user_id", userId)
      .eq("channel_id", data.channel_id)
      .order("created_at", { ascending: true });
    if (error) throw new Error(error.message);
    return (rows ?? []).map((r) => ({
      id: r.id,
      role: r.role as "user" | "assistant",
      content: r.content,
      sources: (r.sources_json as ChatSource[] | null) ?? null,
      created_at: r.created_at,
    }));
  });

export const clearTeardownMessages = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => ChannelInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { error } = await supabase
      .from("teardown_chats")
      .delete()
      .eq("user_id", userId)
      .eq("channel_id", data.channel_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const sendTeardownMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => SendInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    // 1) Load cached teardown for context (service-role read: RLS is closed to end users).
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: cached, error: cachedErr } = await supabaseAdmin
      .from("cached_research")
      .select("channel_name, subscriber_count, teardown_json, outlier_videos_json")
      .eq("channel_id", data.channel_id)
      .maybeSingle();
    if (cachedErr) throw new Error(cachedErr.message);
    if (!cached) throw new Error("Run the teardown first before asking questions about this channel.");

    // 2) Load prior messages.
    const { data: priorRows } = await supabase
      .from("teardown_chats")
      .select("role, content")
      .eq("user_id", userId)
      .eq("channel_id", data.channel_id)
      .order("created_at", { ascending: true })
      .limit(40);

    // 3) Insert the user message immediately.
    const { error: insertUserErr } = await supabase
      .from("teardown_chats")
      .insert({
        user_id: userId,
        channel_id: data.channel_id,
        role: "user",
        content: data.message,
      });
    if (insertUserErr) throw new Error(insertUserErr.message);

    // 4) Call Lovable AI Gateway with a web_search tool.
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) throw new Error("LOVABLE_API_KEY missing");
    const firecrawlKey = process.env.FIRECRAWL_API_KEY;

    const { createLovableAi, DEFAULT_MODEL } = await import("./ai-gateway.server");
    const { generateText, tool, stepCountIs } = await import("ai");
    const ai = createLovableAi(apiKey);

    const collectedSources: ChatSource[] = [];

    const webSearch = tool({
      description:
        "Search the public web for recent, factual information about a YouTube channel, video, or trend. Use when the answer requires info outside the teardown JSON (news, virality reasons, current events, other creators' takes).",
      inputSchema: z.object({
        query: z.string().min(2).max(200).describe("Concise web search query"),
      }),
      execute: async ({ query }: { query: string }) => {
        if (!firecrawlKey) {
          return { error: "Web search is not configured." };
        }
        try {
          const res = await fetch("https://api.firecrawl.dev/v2/search", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${firecrawlKey}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ query, limit: 5 }),
          });
          if (!res.ok) {
            return { error: `Search failed (${res.status})` };
          }
          const json = (await res.json()) as {
            data?: { web?: Array<{ title?: string; url?: string; description?: string }> } | Array<{ title?: string; url?: string; description?: string }>;
          };
          const rawList = Array.isArray(json.data)
            ? json.data
            : (json.data?.web ?? []);
          const results = rawList.slice(0, 5).map((r) => ({
            title: r.title ?? r.url ?? "Untitled",
            url: r.url ?? "",
            snippet: (r.description ?? "").slice(0, 400),
          }));
          for (const r of results) {
            if (!r.url) continue;
            let domain = r.url;
            try {
              domain = new URL(r.url).hostname.replace(/^www\./, "");
            } catch {
              // keep raw
            }
            if (!collectedSources.some((s) => s.url === r.url)) {
              collectedSources.push({ title: r.title, url: r.url, domain });
            }
          }
          return { results };
        } catch (e) {
          return { error: `Search error: ${(e as Error).message}` };
        }
      },
    });

    const system = `You are a YouTube growth analyst helping a creator understand the channel "${cached.channel_name}" (${(cached.subscriber_count ?? 0).toLocaleString()} subscribers).

You have this teardown analysis already prepared:
${JSON.stringify(cached.teardown_json, null, 2)}

Top outlier videos:
${JSON.stringify(cached.outlier_videos_json, null, 2)}

Rules:
- Answer concisely and specifically. Use short paragraphs and bullets where helpful.
- When the user's question is about facts outside the teardown (recent news, why a video went viral, current events, other creators' opinions, dates, numbers you don't have), CALL the web_search tool with a focused query. You may call it more than once.
- Do NOT invent sources or stats. If web_search returns nothing useful, say so.
- When you use web info, cite inline as [domain](url).
- Stay focused on this channel and YouTube growth strategy.`;

    type ChatRole = "user" | "assistant";
    const history = (priorRows ?? []).map((m) => ({
      role: m.role as ChatRole,
      content: m.content,
    }));

    let reply = "";
    try {
      const result = await generateText({
        model: ai(DEFAULT_MODEL),
        system,
        messages: [...history, { role: "user", content: data.message }],
        tools: { web_search: webSearch },
        stopWhen: stepCountIs(50),
      });
      reply = result.text?.trim() || "";
    } catch (e) {
      const msg = (e as Error).message || "AI request failed";
      // Try to keep the user message saved but return a helpful error.
      throw new Error(msg);
    }

    if (!reply) reply = "I couldn't generate a response. Please try again.";

    // 5) Persist assistant reply.
    const { data: assistantRow, error: insertAsstErr } = await supabase
      .from("teardown_chats")
      .insert({
        user_id: userId,
        channel_id: data.channel_id,
        role: "assistant",
        content: reply,
        sources_json: collectedSources.length ? collectedSources : null,
      })
      .select("id, created_at")
      .single();
    if (insertAsstErr) throw new Error(insertAsstErr.message);

    return {
      id: assistantRow.id as string,
      created_at: assistantRow.created_at as string,
      reply,
      sources: collectedSources,
    };
  });
