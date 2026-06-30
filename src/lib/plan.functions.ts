import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

export type Concept = {
  hook: string;
  titles: string[];
  thumbnail_brief: string;
  target_keyword: string;
  why_now: string;
};

export const generatePlan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data: profile } = await supabase.from("profiles").select("*").eq("id", userId).maybeSingle();
    if (!profile) throw new Error("Profile not found");
    const keywords: string[] = profile.niche_keywords ?? [];
    if (!keywords.length) throw new Error("Add niche keywords in onboarding first.");

    // Pull from watchlist + their cached teardowns/outliers
    const { data: watch } = await supabase.from("watchlist").select("*").eq("user_id", userId).limit(10);
    const competitorIds = (watch ?? []).map((w) => w.competitor_channel_id);
    let cached: any[] = [];
    if (competitorIds.length) {
      const { data } = await supabase
        .from("cached_research")
        .select("*")
        .in("channel_id", competitorIds);
      cached = data ?? [];
    }

    const outlierSummary = cached
      .flatMap((c) =>
        (c.outlier_videos_json as any[] | null)?.slice(0, 3).map((v) => `- "${v.title}" (${v.views} views, ${v.outlier_score}x) on ${c.channel_name}`) ?? [],
      )
      .join("\n");

    const { createLovableAi, DEFAULT_MODEL } = await import("./ai-gateway.server");
    const { generateText } = await import("ai");
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) throw new Error("LOVABLE_API_KEY missing");
    const ai = createLovableAi(apiKey);

    const prompt = `You are a YouTube growth coach for a small creator.\nNiche keywords: ${keywords.join(", ")}\nGoal: ${profile.goal ?? "growth"}\nTheir channel size: ${profile.subscriber_count?.toLocaleString() ?? "0"} subs.\n\nWhat is outperforming in their niche right now:\n${outlierSummary || "(no competitor data yet — use your knowledge of the niche)"}\n\nProduce EXACTLY 5 video concepts they should make this week. Each must be:\n- Achievable solo, no big budget\n- Tied to a pattern actually working in this niche\n- Worth the creator's time\n\nReturn ONLY strict minified JSON of this exact shape:\n{"concepts":[\n  {\n    "hook":"1-sentence hook the video opens with",\n    "titles":["title option 1","title option 2","title option 3"],\n    "thumbnail_brief":"What to show + overlay text (1-2 sentences)",\n    "target_keyword":"primary keyword they should target",\n    "why_now":"1 sentence on why this works now in their niche"\n  }\n]}\nNo markdown, no commentary.`;

    const { text } = await generateText({ model: ai(DEFAULT_MODEL), prompt });
    const m = text.match(/\{[\s\S]*\}/);
    if (!m) throw new Error("AI returned no JSON");
    const parsed = JSON.parse(m[0]) as { concepts: Concept[] };
    if (!parsed.concepts?.length) throw new Error("AI returned no concepts");

    const { data: plan, error } = await supabase
      .from("content_plans")
      .insert({
        user_id: userId,
        concepts_json: parsed.concepts as any,
        source_competitors: competitorIds,
      })
      .select()
      .single();
    if (error) throw new Error(error.message);

    // Pre-create concept_outcomes (status=suggested)
    const rows = parsed.concepts.map((c, i) => ({
      user_id: userId,
      content_plan_id: plan.id,
      concept_index: i,
      concept_snapshot: c as any,
      niche_keywords: keywords,
      status: "suggested" as const,
    }));
    await supabase.from("concept_outcomes").insert(rows);

    return plan;
  });

export const getLatestPlan = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data, error } = await supabase
      .from("content_plans")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return data;
  });

const MarkMadeInput = z.object({
  outcome_id: z.string().uuid(),
  video_url: z.string().trim().min(8).max(500),
});

export const markConceptMade = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => MarkMadeInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { parseYouTubeVideoId } = await import("./youtube.server");
    const vid = parseYouTubeVideoId(data.video_url);
    if (!vid) throw new Error("That doesn't look like a YouTube video URL.");
    const { error } = await supabase
      .from("concept_outcomes")
      .update({
        status: "made",
        video_url: data.video_url.trim(),
        video_id: vid,
        marked_made_at: new Date().toISOString(),
      })
      .eq("id", data.outcome_id)
      .eq("user_id", userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const getOutcomes = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data, error } = await supabase
      .from("concept_outcomes")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const measureMyOutcomes = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data: rows } = await supabase
      .from("concept_outcomes")
      .select("*")
      .eq("user_id", userId)
      .in("status", ["made", "measured"]);
    if (!rows?.length) return { measured: 0 };

    const { getVideoById, getChannelById } = await import("./youtube.server");
    const { data: profile } = await supabase.from("profiles").select("subscriber_count, channel_id").eq("id", userId).maybeSingle();
    let currentSubs = profile?.subscriber_count ?? 0;
    if (profile?.channel_id) {
      try {
        const refreshed = await getChannelById(profile.channel_id);
        if (refreshed) currentSubs = refreshed.subscriberCount;
      } catch {}
    }

    let measured = 0;
    for (const r of rows) {
      if (!r.video_id) continue;
      try {
        const v = await getVideoById(r.video_id);
        if (!v) continue;
        const subsAtMade = r.subs_gained == null ? (profile?.subscriber_count ?? 0) : (r.subs_gained ?? 0);
        const outlier = currentSubs > 0 ? Number((v.viewCount / Math.max(1, currentSubs)).toFixed(2)) : null;
        await supabase
          .from("concept_outcomes")
          .update({
            status: "measured",
            views: v.viewCount,
            outlier_score: outlier,
            subs_gained: Math.max(0, currentSubs - subsAtMade),
            measured_at: new Date().toISOString(),
          })
          .eq("id", r.id);
        measured++;
      } catch (e) {
        console.error("measure failed", r.id, e);
      }
    }
    if (profile?.channel_id && currentSubs !== profile.subscriber_count) {
      await supabase.from("profiles").update({ subscriber_count: currentSubs }).eq("id", userId);
    }
    return { measured };
  });
