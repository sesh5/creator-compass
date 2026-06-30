import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

export function pickPeerBand(userSubs: number): { lo: number; hi: number; label: string } {
  // Strict 2x–5x of current size. For true beginners (<1K), the 2x–5x window
  // would be too tiny to be useful (2K–5K), so use a fixed starter band.
  if (userSubs < 1_000) return { lo: 10_000, hi: 100_000, label: "Starter peers (10K–100K)" };
  const lo = userSubs * 2;
  const hi = userSubs * 5;
  return { lo, hi, label: `${formatK(lo)}–${formatK(hi)}` };
}

function formatK(n: number): string {
  if (n >= 1_000_000) {
    const m = n / 1_000_000;
    return `${m % 1 === 0 ? m.toFixed(0) : m.toFixed(1)}M`;
  }
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

function passesKeywordGate(text: string, keywords: string[]): boolean {
  const haystack = text.toLowerCase();
  return keywords.some((kw) => {
    const k = kw.toLowerCase().trim();
    if (!k) return false;
    // word-ish match: surrounded by non-letters or string ends
    const re = new RegExp(`(^|[^a-z0-9])${k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^a-z0-9]|$)`, "i");
    return re.test(haystack);
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

    // Two searches for broader candidate pool: full keyword phrase + primary keyword alone.
    const [idsCombined, idsPrimary] = await Promise.all([
      searchChannelsByKeywords(keywords, 50),
      keywords.length > 1 ? searchChannelsByKeywords([keywords[0]], 50) : Promise.resolve([] as string[]),
    ]);
    const allIds = Array.from(new Set([...idsCombined, ...idsPrimary]));
    const channels = await getChannelsBulk(allIds);

    const userSubs = profile.subscriber_count ?? 0;
    const band = pickPeerBand(userSubs);

    // 1. Strict band filter (non-negotiable)
    const inBand = channels.filter(
      (c) => c.id !== profile.channel_id && c.subscriberCount >= band.lo && c.subscriberCount <= band.hi,
    );

    // 2. Layer A — keyword-presence gate on title + description
    const keywordSurvivors = inBand.filter((c) =>
      passesKeywordGate(`${c.title} ${c.description}`, keywords),
    );

    // 3. Layer B — AI on-niche classifier + tagging in one call
    const SAFETY_CEILING = 30;
    const candidates = keywordSurvivors.slice(0, SAFETY_CEILING);

    const { createLovableAi, DEFAULT_MODEL } = await import("./ai-gateway.server");
    const { generateText } = await import("ai");
    const key = process.env.LOVABLE_API_KEY;
    let aiVerdict: Record<string, { on_niche: boolean; niche_tag: string; why_watch: string }> = {};
    let aiAvailable = false;
    if (key && candidates.length) {
      try {
        const ai = createLovableAi(key);
        const prompt = `You are a strict niche classifier for a YouTube creator.\nCreator's niche keywords: ${keywords.join(", ")}.\nCreator's current subs: ${userSubs}.\n\nFor EACH channel below, decide if it is genuinely IN the creator's niche (same primary topic and audience). Be strict — a travel creator should NOT match cooking, ASMR, gaming, etc. just because a word overlaps.\n\nReturn STRICT JSON keyed by channel id:\n{"<id>": {"on_niche": true|false, "niche_tag": "<2-3 word niche tag>", "why_watch": "<one sentence (<=18 words) explaining what's notable>"}}\n\nChannels:\n${candidates
          .map((c) => `- id=${c.id} | ${c.title} | subs=${c.subscriberCount} | desc=${(c.description || "").slice(0, 220)}`)
          .join("\n")}\n\nReturn ONLY the JSON object, no commentary.`;
        const { text } = await generateText({ model: ai(DEFAULT_MODEL), prompt });
        const match = text.match(/\{[\s\S]*\}/);
        if (match) {
          aiVerdict = JSON.parse(match[0]);
          aiAvailable = true;
        }
      } catch (e) {
        console.error("ai niche-gate failed", e);
      }
    }

    // When AI is available, only keep channels it explicitly marks on_niche.
    // When AI fails, fall back to Layer A survivors (still strict on keyword presence).
    const onNiche = aiAvailable
      ? candidates.filter((c) => aiVerdict[c.id]?.on_niche === true)
      : candidates;

    const ranked = rankCandidates(onNiche);

    return {
      band_label: band.label,
      user_subs: userSubs,
      competitors: ranked.map((c) => ({
        channel_id: c.id,
        channel_name: c.title,
        subscriber_count: c.subscriberCount,
        thumbnail_url: c.thumbnail,
        view_count: c.viewCount,
        video_count: c.videoCount,
        niche_tag: aiVerdict[c.id]?.niche_tag ?? keywords[0] ?? "Niche",
        why_watch: aiVerdict[c.id]?.why_watch ?? "On-niche peer in your size band.",
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
