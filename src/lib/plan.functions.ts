import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { getActiveProject } from "./projects.functions";

export type Concept = {
  hook: string;
  titles: string[];
  thumbnail_brief: string;
  target_keyword: string;
  why_now: string;
};

export type IdeaAnalysis = {
  fit: string;
  demand: string;
  difficulty: string;
  audience: string;
  angle?: string;
};

const IdeaInput = z.object({
  idea: z.string().trim().min(3).max(300),
  count: z.number().int().min(1).max(5).optional(),
});

export const generateConceptsFromIdea = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => IdeaInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const project = await getActiveProject(supabase, userId);
    if (!project) throw new Error("Create a project first.");
    const keywords: string[] = project.niche_keywords ?? [];
    if (!keywords.length) throw new Error("Add niche keywords to this project first.");

    const { data: watch } = await supabase.from("watchlist").select("*").eq("project_id", project.id).limit(8);
    const competitorIds = (watch ?? []).map((w: any) => w.competitor_channel_id);
    let cached: any[] = [];
    if (competitorIds.length) {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { data } = await supabaseAdmin.from("cached_research").select("*").in("channel_id", competitorIds);
      cached = data ?? [];
    }
    const competitorSummary = cached
      .map((c) => {
        const outliers = (c.outlier_videos_json as any[] | null)?.slice(0, 5) ?? [];
        const lines = outliers
          .map((v) => `    • "${v.title}" — ${v.views?.toLocaleString?.() ?? v.views} views (${v.outlier_score}x)`)
          .join("\n");
        return `  - ${c.channel_name} (${c.subscriber_count?.toLocaleString?.() ?? "?"} subs):\n${lines || "    (no outliers cached)"}`;
      })
      .join("\n");

    const count = data.count ?? 3;
    const { createLovableAi } = await import("./ai-gateway.server");
    const { generateText } = await import("ai");
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) throw new Error("LOVABLE_API_KEY missing");
    const ai = createLovableAi(apiKey);

    const prompt = `You are a senior YouTube growth strategist working 1:1 with a creator. Be specific, not generic.

Creator context:
- Niche keywords (HARD constraint — every concept must stay strictly within this niche): ${keywords.join(", ")}
- Channel size: ${project.subscriber_count?.toLocaleString() ?? "0"} subs
- Goal: ${project.goal ?? "growth"}

What is ACTUALLY outperforming in their niche right now (competitor outlier videos):
${competitorSummary || "(no competitor data cached yet — use deep knowledge of this exact niche, name real channels/videos you know to be working)"}

The creator pitched THIS idea (verbatim):
"""${data.idea}"""

Your job:
1. Decide niche fit honestly. If OFF-NICHE (e.g. cooking pitched by a travel creator), set analysis.fit to explain why, return concepts: [].
2. Otherwise, do a real strategic analysis — not generic advice. Reference specific competitor outliers above when you can. Identify the non-obvious angle.
3. Produce EXACTLY ${count} concepts that reframe the pitch through a DIFFERENTIATED angle. Each concept MUST:
   - Name 1-2 specific competitor videos (from the list above, or real videos you know in this niche) it builds on, in why_now.
   - Use a hook that's specific and concrete — NEVER generic phrases like "Top 5...", "Ultimate guide to...", "Everything you need to know about...", "The complete...", "Why X is the best".
   - Have a sharp, contrarian or insight-driven angle, not the obvious take everyone else is doing.
   - Be makeable solo with no big budget.

Return ONLY strict minified JSON, no markdown, exact shape:
{"analysis":{"fit":"1-2 sentences on niche fit","demand":"1 sentence with specifics on search/audience demand for THIS pitch","difficulty":"1 sentence on production effort","audience":"1 sentence on exactly who watches this","angle":"1 sentence: the specific differentiated angle you're taking vs the obvious take"},"concepts":[{"hook":"1-sentence hook (specific, no generic phrasing)","titles":["t1","t2","t3"],"thumbnail_brief":"what to show + overlay text","target_keyword":"primary keyword","why_now":"1 sentence naming 1-2 specific competitor videos this builds on"}]}`;

    const { text } = await generateText({ model: ai("google/gemini-3.1-pro-preview"), prompt });
    const m = text.match(/\{[\s\S]*\}/);
    if (!m) throw new Error("AI returned no JSON");
    const parsed = JSON.parse(m[0]) as { analysis: IdeaAnalysis; concepts: Concept[] };
    return { analysis: parsed.analysis, concepts: parsed.concepts ?? [] };
  });

export const generatePlan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const project = await getActiveProject(supabase, userId);
    if (!project) throw new Error("Create a project first.");
    const keywords: string[] = project.niche_keywords ?? [];
    if (!keywords.length) throw new Error("Add niche keywords to this project first.");

    const { data: watch } = await supabase.from("watchlist").select("*").eq("project_id", project.id).limit(10);
    const competitorIds = (watch ?? []).map((w: any) => w.competitor_channel_id);
    let cached: any[] = [];
    if (competitorIds.length) {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { data } = await supabaseAdmin.from("cached_research").select("*").in("channel_id", competitorIds);
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

    const prompt = `You are a YouTube growth coach for a small creator.\nNiche keywords: ${keywords.join(", ")}\nGoal: ${project.goal ?? "growth"}\nTheir channel size: ${project.subscriber_count?.toLocaleString() ?? "0"} subs.\n\nWhat is outperforming in their niche right now:\n${outlierSummary || "(no competitor data yet — use your knowledge of the niche)"}\n\nProduce EXACTLY 5 video concepts they should make this week. Each must be:\n- Achievable solo, no big budget\n- Tied to a pattern actually working in this niche\n- Worth the creator's time\n\nReturn ONLY strict minified JSON of this exact shape:\n{"concepts":[\n  {\n    "hook":"1-sentence hook the video opens with",\n    "titles":["title option 1","title option 2","title option 3"],\n    "thumbnail_brief":"What to show + overlay text (1-2 sentences)",\n    "target_keyword":"primary keyword they should target",\n    "why_now":"1 sentence on why this works now in their niche"\n  }\n]}\nNo markdown, no commentary.`;

    const { text } = await generateText({ model: ai(DEFAULT_MODEL), prompt });
    const m = text.match(/\{[\s\S]*\}/);
    if (!m) throw new Error("AI returned no JSON");
    const parsed = JSON.parse(m[0]) as { concepts: Concept[] };
    if (!parsed.concepts?.length) throw new Error("AI returned no concepts");

    const { data: plan, error } = await supabase
      .from("content_plans")
      .insert({
        user_id: userId,
        project_id: project.id,
        concepts_json: parsed.concepts as any,
        source_competitors: competitorIds,
      } as any)
      .select()
      .single();
    if (error) throw new Error(error.message);

    const rows = parsed.concepts.map((c, i) => ({
      user_id: userId,
      project_id: project.id,
      content_plan_id: plan.id,
      concept_index: i,
      concept_snapshot: c as any,
      niche_keywords: keywords,
      status: "suggested" as const,
    }));
    await supabase.from("concept_outcomes").insert(rows as any);

    return plan;
  });

export const getLatestPlan = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const project = await getActiveProject(supabase, userId);
    if (!project) return null;
    const { data, error } = await supabase
      .from("content_plans")
      .select("*")
      .eq("project_id", project.id)
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
    const { parseYouTubeVideoId, getVideoById, getChannelById } = await import("./youtube.server");
    const vid = parseYouTubeVideoId(data.video_url);
    if (!vid) throw new Error("That doesn't look like a YouTube video URL.");

    const nowIso = new Date().toISOString();
    type OutcomeUpdate = {
      status: "made" | "measured";
      video_url: string;
      video_id: string;
      marked_made_at: string;
      views?: number;
      outlier_score?: number | null;
      subs_gained?: number;
      measured_at?: string;
    };
    const baseUpdate: OutcomeUpdate = {
      status: "made",
      video_url: data.video_url.trim(),
      video_id: vid,
      marked_made_at: nowIso,
    };

    // Verify the video actually exists on YouTube before saving anything.
    const v = await getVideoById(vid);
    if (!v) {
      throw new Error("We couldn't find that video on YouTube. Double-check the URL — it needs to be a public video you own.");
    }

    // Measure immediately so the Results page isn't empty.
    let measured = false;
    let videoTitle: string = v.title;
    try {
      const project = await getActiveProject(supabase, userId);
      if (project) {
        let currentSubs = project.subscriber_count ?? 0;
        if (project.channel_id) {
          try {
            const refreshed = await getChannelById(project.channel_id);
            if (refreshed) currentSubs = refreshed.subscriberCount;
          } catch {}
        }
        const subsAtMade = project.subscriber_count ?? 0;
        const outlier = currentSubs > 0 ? Number((v.viewCount / Math.max(1, currentSubs)).toFixed(2)) : null;
        baseUpdate.status = "measured";
        baseUpdate.views = v.viewCount;
        baseUpdate.outlier_score = outlier;
        baseUpdate.subs_gained = Math.max(0, currentSubs - subsAtMade);
        baseUpdate.measured_at = nowIso;
        measured = true;
        if (project.channel_id && currentSubs !== project.subscriber_count) {
          await supabase.from("projects").update({ subscriber_count: currentSubs }).eq("id", project.id);
        }
      }
    } catch (e) {
      console.error("auto-measure on markConceptMade failed", e);
    }

    const { error } = await supabase
      .from("concept_outcomes")
      .update(baseUpdate)
      .eq("id", data.outcome_id)
      .eq("user_id", userId);
    if (error) throw new Error(error.message);
    return { ok: true, measured, video_title: videoTitle };
  });

export const getOutcomes = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const project = await getActiveProject(supabase, userId);
    if (!project) return [];
    const { data, error } = await supabase
      .from("concept_outcomes")
      .select("*")
      .eq("project_id", project.id)
      .eq("user_id", userId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const measureMyOutcomes = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const project = await getActiveProject(supabase, userId);
    if (!project) return { measured: 0, skipped: 0 };
    const { data: rows } = await supabase
      .from("concept_outcomes")
      .select("*")
      .eq("project_id", project.id)
      .eq("user_id", userId)
      .in("status", ["made", "measured"]);
    if (!rows?.length) return { measured: 0, skipped: 0 };

    const { getVideoById, getChannelById } = await import("./youtube.server");
    let currentSubs = project.subscriber_count ?? 0;
    if (project.channel_id) {
      try {
        const refreshed = await getChannelById(project.channel_id);
        if (refreshed) currentSubs = refreshed.subscriberCount;
      } catch {}
    }

    let measured = 0;
    let skipped = 0;
    for (const r of rows as any[]) {
      if (!r.video_id) { skipped++; continue; }
      try {
        const v = await getVideoById(r.video_id, { fresh: true });
        if (!v) {
          console.warn("measure: video not found", { outcome_id: r.id, video_id: r.video_id });
          skipped++;
          continue;
        }
        const subsAtMade = r.subs_gained == null ? (project.subscriber_count ?? 0) : (r.subs_gained ?? 0);
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
        skipped++;
      }
    }
    if (project.channel_id && currentSubs !== project.subscriber_count) {
      await supabase.from("projects").update({ subscriber_count: currentSubs }).eq("id", project.id);
    }
    return { measured, skipped };
  });
