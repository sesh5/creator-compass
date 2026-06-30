// YouTube Data API v3 helpers with shared Postgres cache to stay under quota.
// Usage: search=100u, channels=1u, videos=1u, playlistItems=1u
import { createClient } from "@supabase/supabase-js";

const YT_BASE = "https://www.googleapis.com/youtube/v3";

function admin() {
  return createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function readCache(key: string, maxAgeMs: number): Promise<unknown | null> {
  const sb = admin();
  const { data } = await sb
    .from("youtube_api_cache")
    .select("payload, fetched_at")
    .eq("cache_key", key)
    .maybeSingle();
  if (!data) return null;
  const age = Date.now() - new Date(data.fetched_at).getTime();
  if (age > maxAgeMs) return null;
  return data.payload;
}

async function writeCache(key: string, payload: unknown) {
  const sb = admin();
  await sb.from("youtube_api_cache").upsert({ cache_key: key, payload: payload as never, fetched_at: new Date().toISOString() });
}

async function ytFetch<T = unknown>(path: string, params: Record<string, string>, cacheKey: string, ttlMs: number): Promise<T> {
  const cached = await readCache(cacheKey, ttlMs);
  if (cached) return cached as T;
  const key = process.env.YOUTUBE_API_KEY;
  if (!key) throw new Error("YOUTUBE_API_KEY is not configured");
  const url = new URL(`${YT_BASE}/${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  url.searchParams.set("key", key);
  const res = await fetch(url.toString());
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`YouTube API ${res.status}: ${text.slice(0, 300)}`);
  }
  const json = (await res.json()) as T;
  await writeCache(cacheKey, json);
  return json;
}

export type YtChannel = {
  id: string;
  title: string;
  description: string;
  thumbnail: string;
  subscriberCount: number;
  videoCount: number;
  viewCount: number;
  uploadsPlaylistId: string;
};

export type YtVideo = {
  id: string;
  title: string;
  description: string;
  thumbnail: string;
  publishedAt: string;
  viewCount: number;
  likeCount: number;
  commentCount: number;
  duration: string;
};

function pickThumb(t: Record<string, { url: string }> | undefined): string {
  if (!t) return "";
  return t.medium?.url ?? t.high?.url ?? t.default?.url ?? "";
}

export async function getChannelByHandleOrUrl(input: string): Promise<YtChannel | null> {
  const trimmed = input.trim();
  // Try to extract channel id
  let channelId: string | null = null;
  let handle: string | null = null;

  const idMatch = trimmed.match(/channel\/(UC[\w-]{20,})/);
  if (idMatch) channelId = idMatch[1];
  const handleMatch = trimmed.match(/@([\w.-]+)/);
  if (handleMatch) handle = handleMatch[1];
  if (!channelId && !handle && /^UC[\w-]{20,}$/.test(trimmed)) channelId = trimmed;
  if (!channelId && !handle) handle = trimmed.replace(/^@/, "");

  if (channelId) return getChannelById(channelId);
  if (handle) return getChannelByHandle(handle);
  return null;
}

export async function getChannelById(id: string): Promise<YtChannel | null> {
  const data = await ytFetch<{ items: any[] }>(
    "channels",
    { part: "snippet,statistics,contentDetails", id },
    `channel:id:${id}`,
    1000 * 60 * 60 * 24,
  );
  const it = data.items?.[0];
  if (!it) return null;
  return {
    id: it.id,
    title: it.snippet.title,
    description: it.snippet.description ?? "",
    thumbnail: pickThumb(it.snippet.thumbnails),
    subscriberCount: Number(it.statistics?.subscriberCount ?? 0),
    videoCount: Number(it.statistics?.videoCount ?? 0),
    viewCount: Number(it.statistics?.viewCount ?? 0),
    uploadsPlaylistId: it.contentDetails?.relatedPlaylists?.uploads ?? "",
  };
}

export async function getChannelByHandle(handle: string): Promise<YtChannel | null> {
  const data = await ytFetch<{ items: any[] }>(
    "channels",
    { part: "snippet,statistics,contentDetails", forHandle: handle },
    `channel:handle:${handle.toLowerCase()}`,
    1000 * 60 * 60 * 24,
  );
  const it = data.items?.[0];
  if (!it) return null;
  return {
    id: it.id,
    title: it.snippet.title,
    description: it.snippet.description ?? "",
    thumbnail: pickThumb(it.snippet.thumbnails),
    subscriberCount: Number(it.statistics?.subscriberCount ?? 0),
    videoCount: Number(it.statistics?.videoCount ?? 0),
    viewCount: Number(it.statistics?.viewCount ?? 0),
    uploadsPlaylistId: it.contentDetails?.relatedPlaylists?.uploads ?? "",
  };
}

export async function searchChannelsByKeywords(keywords: string[], maxResults = 25): Promise<string[]> {
  const q = keywords.join(" ");
  const key = `search:channels:${q.toLowerCase()}:${maxResults}`;
  const data = await ytFetch<{ items: any[] }>(
    "search",
    { part: "snippet", type: "channel", q, maxResults: String(maxResults), relevanceLanguage: "en" },
    key,
    1000 * 60 * 60 * 24 * 3,
  );
  return (data.items ?? []).map((i: any) => i.snippet?.channelId).filter(Boolean);
}

export async function getChannelsBulk(ids: string[]): Promise<YtChannel[]> {
  if (!ids.length) return [];
  const out: YtChannel[] = [];
  // YT allows up to 50 ids per channels.list call
  for (let i = 0; i < ids.length; i += 50) {
    const chunk = ids.slice(i, i + 50);
    const key = `channels:bulk:${chunk.sort().join(",")}`;
    const data = await ytFetch<{ items: any[] }>(
      "channels",
      { part: "snippet,statistics,contentDetails", id: chunk.join(",") },
      key,
      1000 * 60 * 60 * 24,
    );
    for (const it of data.items ?? []) {
      out.push({
        id: it.id,
        title: it.snippet.title,
        description: it.snippet.description ?? "",
        thumbnail: pickThumb(it.snippet.thumbnails),
        subscriberCount: Number(it.statistics?.subscriberCount ?? 0),
        videoCount: Number(it.statistics?.videoCount ?? 0),
        viewCount: Number(it.statistics?.viewCount ?? 0),
        uploadsPlaylistId: it.contentDetails?.relatedPlaylists?.uploads ?? "",
      });
    }
  }
  return out;
}

export async function getRecentVideos(channel: YtChannel, max = 20): Promise<YtVideo[]> {
  if (!channel.uploadsPlaylistId) return [];
  const pl = await ytFetch<{ items: any[] }>(
    "playlistItems",
    { part: "snippet,contentDetails", playlistId: channel.uploadsPlaylistId, maxResults: String(max) },
    `uploads:${channel.uploadsPlaylistId}:${max}`,
    1000 * 60 * 60 * 6,
  );
  const ids = (pl.items ?? []).map((i: any) => i.contentDetails?.videoId).filter(Boolean);
  if (!ids.length) return [];
  const vids = await ytFetch<{ items: any[] }>(
    "videos",
    { part: "snippet,statistics,contentDetails", id: ids.join(",") },
    `videos:${ids.sort().join(",")}`,
    1000 * 60 * 60 * 6,
  );
  return (vids.items ?? []).map((it: any) => ({
    id: it.id,
    title: it.snippet.title,
    description: it.snippet.description ?? "",
    thumbnail: pickThumb(it.snippet.thumbnails),
    publishedAt: it.snippet.publishedAt,
    viewCount: Number(it.statistics?.viewCount ?? 0),
    likeCount: Number(it.statistics?.likeCount ?? 0),
    commentCount: Number(it.statistics?.commentCount ?? 0),
    duration: it.contentDetails?.duration ?? "",
  }));
}

export async function getVideoById(id: string): Promise<YtVideo | null> {
  const data = await ytFetch<{ items: any[] }>(
    "videos",
    { part: "snippet,statistics,contentDetails", id },
    `video:${id}`,
    1000 * 60 * 60 * 2,
  );
  const it = data.items?.[0];
  if (!it) return null;
  return {
    id: it.id,
    title: it.snippet.title,
    description: it.snippet.description ?? "",
    thumbnail: pickThumb(it.snippet.thumbnails),
    publishedAt: it.snippet.publishedAt,
    viewCount: Number(it.statistics?.viewCount ?? 0),
    likeCount: Number(it.statistics?.likeCount ?? 0),
    commentCount: Number(it.statistics?.commentCount ?? 0),
    duration: it.contentDetails?.duration ?? "",
  };
}

export function parseYouTubeVideoId(url: string): string | null {
  const m = url.match(/(?:v=|youtu\.be\/|shorts\/|embed\/)([\w-]{11})/);
  if (m) return m[1];
  if (/^[\w-]{11}$/.test(url.trim())) return url.trim();
  return null;
}
