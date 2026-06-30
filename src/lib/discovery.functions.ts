import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

export function pickPeerBand(userSubs: number): { lo: number; hi: number; label: string } {
  if (userSubs <= 0) return { lo: 10_000, hi: 250_000, label: "10K–250K" };
  if (userSubs < 1_000) return { lo: 25_000, hi: 500_000, label: "25K–500K" };
  if (userSubs < 10_000) return { lo: 100_000, hi: 1_000_000, label: "100K–1M" };
  if (userSubs < 100_000) return { lo: 500_000, hi: 5_000_000, label: "500K–5M" };
  if (userSubs < 1_000_000)
    return { lo: userSubs * 2, hi: userSubs * 20, label: `${formatK(userSubs * 2)}–${formatK(userSubs * 20)}` };
  return { lo: Math.floor(userSubs * 1.5), hi: userSubs * 10, label: `${formatK(userSubs * 1.5)}–${formatK(userSubs * 10)}` };
}

function formatK(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n % 1_000_000 ? 1 : 0)}M`;
  if (n >= 1_000) return `${Math.round(n / 1_000)}K`;
  return String(n);
}

function rankCandidates<T extends { subscriberCount: number; viewCount: number }>(items: T[]): T[] {
  if (!items.length) return items;
  const ratios = items.map((c) => c.viewCount / Math.max(1, c.subscriberCount));
  const subs = items.map((c) => c.subscriberCount);
  const minR = Math.min(...ratios), maxR = Math.max(...ratios);
  const minS = Math.min(...subs), maxS = Math.max(...subs);
  const norm = (v: number, lo: number, hi: number) => (hi === lo ? 0.5 : (v - lo) / (hi - lo));
  return [...items].sort((a, b) => {
    const sa = 0.6 * norm(a.viewCount / Math.max(1, a.subscriberCount), minR, maxR) + 0.4 * norm(a.subscriberCount, minS, maxS);
    const sb = 0.6 * norm(b.viewCount / Math.max(1, b.subscriberCount), minR, maxR) + 0.4 * norm(b.subscriberCount, minS, maxS);
    return sb - sa;
  });
}

export const discoverCompetitors = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data: profile } = await supabase.from("profiles").select("*").eq("id", userId).maybeSingle();
    if (!profile) throw new Error("Profile not found");

    const { searchChannelsByKeywords, getChannelsBulk } = await import("./youtube.server");
    const keywords: string[] = profile.niche_keywords ?? [];
    if (!keywords.length) throw new Error("Add at least one niche keyword first.");

    const ids = await searchChannelsByKeywords(keywords, 50);
    const channels = await getChannelsBulk(ids);

    const userSubs = profile.subscriber_count ?? 0;
    const band = pickPeerBand(userSubs);

    const inBand = (lo: number, hi: number) =>
      channels.filter(
        (c) => c.id !== profile.channel_id && c.subscriberCount >= lo && c.subscriberCount <= hi,
      );

    let filtered = inBand(band.lo, band.hi);
    if (filtered.length < 10) {
      filtered = inBand(Math.floor(band.lo * 0.5), Math.floor(band.hi * 1.5));
    }

    const ranked = rankCandidates(filtered);
    const out = ranked.slice(0, 15);

    const { createLovableAi, DEFAULT_MODEL } = await import("./ai-gateway.server");
    const { generateText } = await import("ai");
    const key = process.env.LOVABLE_API_KEY;
    let tags: Record<string, { niche_tag: string; why_watch: string }> = {};
    if (key && out.length) {
      try {
        const ai = createLovableAi(key);
        const prompt = `You are helping a YouTube creator (niche: ${keywords.join(", ")}, current subs: ${userSubs}) decide which competitors to watch.\nFor EACH channel below return strict JSON keyed by channel id:\n{"<id>": {"niche_tag": "<2-3 word niche tag>", "why_watch": "<one sentence (<= 18 words) explaining what's notable>"}}\n\nChannels:\n${out
          .map((c) => `- id=${c.id} | ${c.title} | subs=${c.subscriberCount} | desc=${(c.description || "").slice(0, 200)}`)
          .join("\n")}\n\nReturn ONLY the JSON object, no commentary.`;
        const { text } = await generateText({ model: ai(DEFAULT_MODEL), prompt });
        const match = text.match(/\{[\s\S]*\}/);
        if (match) tags = JSON.parse(match[0]);
      } catch (e) {
        console.error("ai tagging failed", e);
      }
    }

    return {
      band_label: band.label,
      user_subs: userSubs,
      competitors: out.map((c) => ({
        channel_id: c.id,
        channel_name: c.title,
        subscriber_count: c.subscriberCount,
        thumbnail_url: c.thumbnail,
        view_count: c.viewCount,
        video_count: c.videoCount,
        niche_tag: tags[c.id]?.niche_tag ?? keywords[0] ?? "Niche",
        why_watch: tags[c.id]?.why_watch ?? "Achievable peer in your niche.",
      })),
    };
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
