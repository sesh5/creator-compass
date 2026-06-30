import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { getActiveProject } from "./projects.functions";

export function pickPeerBand(userSubs: number): { lo: number; hi: number; coreLo: number; coreHi: number; label: string } {
  if (userSubs < 1_000) return { lo: 5_000, hi: 200_000, coreLo: 10_000, coreHi: 100_000, label: "Starter peers (10K–100K)" };
  const coreLo = userSubs * 2;
  const coreHi = userSubs * 5;
  const lo = Math.floor(userSubs * 0.5);
  const hi = Math.ceil(userSubs * 8);
  return { lo, hi, coreLo, coreHi, label: `${formatK(coreLo)}–${formatK(coreHi)} core · ${formatK(lo)}–${formatK(hi)} ladder` };
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
  const terms = expandNicheTerms(keywords);
  return terms.some((kw) => {
    const k = kw.toLowerCase().trim();
    if (!k) return false;
    const re = new RegExp(`(^|[^a-z0-9])${k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^a-z0-9]|$)`, "i");
    return re.test(haystack);
  });
}

function expandNicheTerms(keywords: string[]): string[] {
  const stop = new Set(["and", "or", "the", "a", "an", "to", "for", "with", "of", "in", "on", "by", "best", "top"]);
  const terms = new Set<string>();
  for (const keyword of keywords) {
    const cleaned = keyword.toLowerCase().replace(/[^a-z0-9\s-]/g, " ").replace(/\s+/g, " ").trim();
    if (!cleaned) continue;
    terms.add(cleaned);
    for (const token of cleaned.split(/[\s-]+/)) {
      if (token.length >= 3 && !stop.has(token)) terms.add(token);
      if (token.endsWith("s") && token.length > 4) terms.add(token.slice(0, -1));
    }
  }
  return Array.from(terms);
}

function buildSearchQueries(keywords: string[]): string[] {
  const terms = expandNicheTerms(keywords);
  const primary = terms.find((t) => !/^(vlog|vlogs|blog|blogs|channel|channels|creator|creators|video|videos|tips|guide|guides)$/.test(t)) ?? terms[0];
  const queries = new Set<string>();

  const phrase = keywords.join(" ").replace(/\s+/g, " ").trim();
  if (phrase) queries.add(phrase);
  for (const keyword of keywords) {
    const cleaned = keyword.replace(/\s+/g, " ").trim();
    if (cleaned) {
      queries.add(cleaned);
      queries.add(`${cleaned} channel`);
      queries.add(`${cleaned} tutorial`);
    }
  }
  // Multi-word combos of distinct keywords
  for (let i = 0; i < keywords.length; i++) {
    for (let j = i + 1; j < keywords.length; j++) {
      queries.add(`${keywords[i]} ${keywords[j]}`);
    }
  }
  if (primary) {
    queries.add(primary);
    queries.add(`${primary} channel`);
    queries.add(`${primary} creator`);
    queries.add(`${primary} youtuber`);
    if (/vlog|vlogs|blog|blogs/i.test(phrase)) {
      queries.add(`${primary} vlog`);
      queries.add(`${primary} vlogger`);
    }
  }

  return Array.from(queries).slice(0, 14);
}

type AiVerdict = { on_niche: boolean; niche_tag: string; why_watch: string };

export const discoverCompetitors = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const project = await getActiveProject(supabase, userId);
    if (!project) throw new Error("Create a project first.");

    const { searchChannelsByQuery, getChannelsBulk } = await import("./youtube.server");
    const keywords: string[] = project.niche_keywords ?? [];
    if (!keywords.length) throw new Error("Add at least one niche keyword to this project.");

    const queries = buildSearchQueries(keywords);
    const searches = queries.flatMap((query) => [
      searchChannelsByQuery(query, 150, "relevance"),
      searchChannelsByQuery(query, 100, "viewCount"),
    ]);
    const searchResults = await Promise.all(searches);
    const allIds = Array.from(new Set(searchResults.flat()));
    const channels = await getChannelsBulk(allIds);

    const userSubs = project.subscriber_count ?? 0;
    const band = pickPeerBand(userSubs);

    const inBand = channels.filter(
      (c) => c.id !== project.channel_id && c.subscriberCount >= band.lo && c.subscriberCount <= band.hi,
    );

    const keywordSurvivors = inBand.filter((c) =>
      passesKeywordGate(`${c.title} ${c.description}`, keywords),
    );

    const candidates = keywordSurvivors;

    const { createLovableAi, DEFAULT_MODEL } = await import("./ai-gateway.server");
    const { generateText } = await import("ai");
    const key = process.env.LOVABLE_API_KEY;
    let aiVerdict: Record<string, AiVerdict> = {};
    let aiAvailable = false;
    if (key && candidates.length) {
      try {
        const ai = createLovableAi(key);
        for (let i = 0; i < candidates.length; i += 35) {
          const batch = candidates.slice(i, i + 35);
          const prompt = `You are a strict niche classifier for a YouTube creator.\nCreator's niche keywords: ${keywords.join(", ")}.\nCreator's current subs: ${userSubs}.\n\nFor EACH channel below, decide if it is genuinely IN the creator's niche (same primary topic, format, and audience). Be strict — a travel vlog creator should NOT match cooking, ASMR, gaming, camping gear, or unrelated lifestyle channels just because a word overlaps.\n\nReturn STRICT JSON keyed by channel id:\n{"<id>": {"on_niche": true|false, "niche_tag": "<2-3 word niche tag>", "why_watch": "<one sentence (<=18 words) explaining what's notable>"}}\n\nChannels:\n${batch
            .map((c) => `- id=${c.id} | ${c.title} | subs=${c.subscriberCount} | views=${c.viewCount} | desc=${(c.description || "").slice(0, 260)}`)
            .join("\n")}\n\nReturn ONLY the JSON object, no commentary.`;
          const { text } = await generateText({ model: ai(DEFAULT_MODEL), prompt });
          const match = text.match(/\{[\s\S]*\}/);
          if (match) {
            aiVerdict = { ...aiVerdict, ...JSON.parse(match[0]) };
            aiAvailable = true;
          }
        }
      } catch (e) {
        console.error("ai niche-gate failed", e);
      }
    }

    const onNiche = aiAvailable
      ? candidates.filter((c) => aiVerdict[c.id]?.on_niche === true)
      : candidates;

    const ranked = rankCandidates(onNiche);

    return {
      band_label: band.label,
      user_subs: userSubs,
      candidate_count: channels.length,
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
    const project = await getActiveProject(supabase, userId);
    if (!project) throw new Error("Create a project first.");
    const { error } = await supabase.from("watchlist").upsert(
      {
        user_id: userId,
        project_id: project.id,
        competitor_channel_id: data.channel_id,
        channel_name: data.channel_name,
        subscriber_count: data.subscriber_count,
        thumbnail_url: data.thumbnail_url ?? null,
        niche_tag: data.niche_tag ?? null,
        why_watch: data.why_watch ?? null,
      } as any,
      { onConflict: "project_id,competitor_channel_id" },
    );
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const removeFromWatchlist = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ channel_id: z.string().min(1) }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const project = await getActiveProject(supabase, userId);
    if (!project) throw new Error("Create a project first.");
    const { error } = await supabase
      .from("watchlist")
      .delete()
      .eq("project_id", project.id)
      .eq("user_id", userId)
      .eq("competitor_channel_id", data.channel_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const getWatchlist = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const project = await getActiveProject(supabase, userId);
    if (!project) return [];
    const { data, error } = await supabase
      .from("watchlist")
      .select("*")
      .eq("project_id", project.id)
      .eq("user_id", userId)
      .order("added_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  });
