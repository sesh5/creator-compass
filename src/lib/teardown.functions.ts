import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const Input = z.object({ channel_id: z.string().min(1).max(64), force: z.boolean().optional() });

function extractJson(response: string): unknown {
  let cleaned = response.replace(/```json\s*/gi, "").replace(/```\s*/g, "").trim();
  const start = cleaned.search(/[\{\[]/);
  const openChar = start !== -1 ? cleaned[start] : "";
  const endChar = openChar === "[" ? "]" : "}";
  const end = cleaned.lastIndexOf(endChar);
  if (start === -1 || end === -1) throw new Error("No JSON found in AI response");
  cleaned = cleaned.substring(start, end + 1);
  try {
    return JSON.parse(cleaned);
  } catch {
    const fixed = cleaned
      .replace(/,\s*}/g, "}")
      .replace(/,\s*]/g, "]")
      .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "")
      .replace(/([{,]\s*"[^"]+"\s*:\s*")((?:[^"\\]|\\.)*?)(?<!\\)\n((?:[^"\\]|\\.)*?)"/g, '$1$2\\n$3"');
    return JSON.parse(fixed);
  }
}

export type Teardown = {
  why_winning: string;
  cadence: string;
  hook_style: string;
  title_patterns: string;
  thumbnail_approach: string;
  typical_length: string;
  content_pillars: string[];
  best_video: { title: string; video_id: string; views: number; why: string };
  worst_video: { title: string; video_id: string; views: number; why: string };
};

export type OutlierVideo = {
  video_id: string;
  title: string;
  thumbnail: string;
  views: number;
  published_at: string;
  outlier_score: number;
};

export const getTeardown = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => Input.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const TTL = 1000 * 60 * 60 * 24 * 7;

    if (!data.force) {
      const { data: cached } = await supabase
        .from("cached_research")
        .select("*")
        .eq("channel_id", data.channel_id)
        .maybeSingle();
      if (cached && Date.now() - new Date(cached.fetched_at).getTime() < TTL) {
        return {
          channel_id: cached.channel_id,
          channel_name: cached.channel_name ?? "",
          subscriber_count: cached.subscriber_count ?? 0,
          teardown: cached.teardown_json as unknown as Teardown,
          outliers: cached.outlier_videos_json as unknown as OutlierVideo[],
          fetched_at: cached.fetched_at,
        };
      }
    }


    const { getChannelById, getRecentVideos } = await import("./youtube.server");
    const channel = await getChannelById(data.channel_id);
    if (!channel) throw new Error("Channel not found");
    const videos = await getRecentVideos(channel, 20);
    if (!videos.length) throw new Error("No recent videos found for this channel");

    const subs = Math.max(1, channel.subscriberCount);
    const ranked = videos.map((v) => ({ ...v, outlier_score: v.viewCount / subs }));
    ranked.sort((a, b) => b.outlier_score - a.outlier_score);
    const outliers: OutlierVideo[] = ranked.slice(0, 6).map((v) => ({
      video_id: v.id,
      title: v.title,
      thumbnail: v.thumbnail,
      views: v.viewCount,
      published_at: v.publishedAt,
      outlier_score: Number(v.outlier_score.toFixed(2)),
    }));

    // AI teardown
    const { createLovableAi, DEFAULT_MODEL } = await import("./ai-gateway.server");
    const { generateText } = await import("ai");
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) throw new Error("LOVABLE_API_KEY missing");
    const ai = createLovableAi(apiKey);

    const videosForPrompt = ranked
      .map(
        (v, i) =>
          `${i + 1}. id=${v.id} | "${v.title}" | views=${v.viewCount} | outlier=${v.outlier_score.toFixed(2)} | published=${v.publishedAt} | duration=${v.duration}`,
      )
      .join("\n");

    const prompt = `You are a YouTube growth strategist analysing the channel "${channel.title}" (${channel.subscriberCount.toLocaleString()} subs).\n\nRecent videos (sorted best-to-worst by outlier score = views ÷ subscriber count):\n${videosForPrompt}\n\nReturn ONLY strict minified JSON with this exact shape:\n{\n  "why_winning": "2-3 short sentences on what's clearly working",\n  "cadence": "e.g. 2x/week, weekly, sporadic",\n  "hook_style": "1 sentence on how titles/thumbs hook viewers",\n  "title_patterns": "1-2 sentences on patterns you see",\n  "thumbnail_approach": "1 sentence on thumbnail style",\n  "typical_length": "e.g. 8-12 min",\n  "content_pillars": ["pillar 1","pillar 2","pillar 3"],\n  "best_video": {"video_id":"<id>","title":"<title>","views":<int>,"why":"why it worked"},\n  "worst_video": {"video_id":"<id>","title":"<title>","views":<int>,"why":"why it underperformed"}\n}\nNo markdown, no commentary, JSON only.`;

    const { text } = await generateText({ model: ai(DEFAULT_MODEL), prompt });
    const teardown = extractJson(text) as Teardown;

    const row = {
      channel_id: channel.id,
      channel_name: channel.title,
      subscriber_count: channel.subscriberCount,
      teardown_json: teardown,
      outlier_videos_json: outliers,
      fetched_at: new Date().toISOString(),
    };

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("cached_research").upsert(row as any, { onConflict: "channel_id" });

    return {
      channel_id: channel.id,
      channel_name: channel.title,
      subscriber_count: channel.subscriberCount,
      teardown: teardown,
      outliers: outliers,
      fetched_at: row.fetched_at,
    };
  });
