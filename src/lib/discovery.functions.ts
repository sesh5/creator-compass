import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

export const discoverCompetitors = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data: profile } = await supabase.from("profiles").select("*").eq("id", userId).maybeSingle();
    if (!profile) throw new Error("Profile not found");

    const { searchChannelsByKeywords, getChannelsBulk } = await import("./youtube.server");
    const keywords: string[] = profile.niche_keywords ?? [];
    if (!keywords.length) throw new Error("Add at least one niche keyword first.");

    const ids = await searchChannelsByKeywords(keywords, 30);
    const channels = await getChannelsBulk(ids);

    const userSubs = profile.subscriber_count ?? 0;
    let filtered = channels;
    if (userSubs > 0) {
      const lo = Math.max(50, userSubs * 1.5);
      const hi = Math.max(userSubs * 8, 50_000);
      filtered = channels.filter((c) => c.subscriberCount >= lo && c.subscriberCount <= hi);
    } else {
      // No channel yet → small but growing
      filtered = channels.filter((c) => c.subscriberCount >= 500 && c.subscriberCount <= 200_000);
    }
    filtered = filtered.filter((c) => c.id !== profile.channel_id);
    filtered.sort((a, b) => b.viewCount / Math.max(1, b.subscriberCount) - a.viewCount / Math.max(1, a.subscriberCount));
    const out = filtered.slice(0, 20);

    // AI: one-line "why watch" tags
    const { createLovableAi, DEFAULT_MODEL } = await import("./ai-gateway.server");
    const { generateText } = await import("ai");
    const key = process.env.LOVABLE_API_KEY;
    let tags: Record<string, { niche_tag: string; why_watch: string }> = {};
    if (key && out.length) {
      try {
        const ai = createLovableAi(key);
        const prompt = `You are helping a YouTube creator (niche: ${keywords.join(", ")}) decide which competitors to watch.\nFor EACH channel below return strict JSON keyed by channel id:\n{"<id>": {"niche_tag": "<2-3 word niche tag>", "why_watch": "<one sentence (<= 18 words) explaining what's notable>"}}\n\nChannels:\n${out
          .map((c) => `- id=${c.id} | ${c.title} | subs=${c.subscriberCount} | desc=${(c.description || "").slice(0, 200)}`)
          .join("\n")}\n\nReturn ONLY the JSON object, no commentary.`;
        const { text } = await generateText({ model: ai(DEFAULT_MODEL), prompt });
        const match = text.match(/\{[\s\S]*\}/);
        if (match) tags = JSON.parse(match[0]);
      } catch (e) {
        console.error("ai tagging failed", e);
      }
    }

    return out.map((c) => ({
      channel_id: c.id,
      channel_name: c.title,
      subscriber_count: c.subscriberCount,
      thumbnail_url: c.thumbnail,
      view_count: c.viewCount,
      video_count: c.videoCount,
      niche_tag: tags[c.id]?.niche_tag ?? keywords[0] ?? "Niche",
      why_watch: tags[c.id]?.why_watch ?? "Achievable peer in your niche.",
    }));
  });

const AddInput = z.object({
  channel_id: z.string().min(1).max(64),
  channel_name: z.string().min(1).max(200),
  subscriber_count: z.number().int().nonnegative(),
  thumbnail_url: z.string().max(500).optional().nullable(),
  niche_tag: z.string().max(80).optional().nullable(),
  why_watch: z.string().max(400).optional().nullable(),
});

export const addToWatchlist = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => AddInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { error } = await supabase.from("watchlist").upsert(
      {
        user_id: userId,
        competitor_channel_id: data.channel_id,
        channel_name: data.channel_name,
        subscriber_count: data.subscriber_count,
        thumbnail_url: data.thumbnail_url ?? null,
        niche_tag: data.niche_tag ?? null,
        why_watch: data.why_watch ?? null,
      },
      { onConflict: "user_id,competitor_channel_id" },
    );
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const removeFromWatchlist = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ channel_id: z.string().min(1) }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { error } = await supabase
      .from("watchlist")
      .delete()
      .eq("user_id", userId)
      .eq("competitor_channel_id", data.channel_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const getWatchlist = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data, error } = await supabase
      .from("watchlist")
      .select("*")
      .eq("user_id", userId)
      .order("added_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  });
