import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";

// Public cron endpoint: refreshes stats for every "made" or "measured" concept_outcome.
// Auth: requires the Supabase anon key in an apikey header (pg_cron passes it).
export const Route = createFileRoute("/api/public/hooks/measure-outcomes")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const apikey = request.headers.get("apikey") ?? "";
        if (apikey !== process.env.SUPABASE_PUBLISHABLE_KEY) {
          return new Response("Unauthorized", { status: 401 });
        }
        const sb = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
          auth: { persistSession: false, autoRefreshToken: false },
        });
        const { data: rows } = await sb
          .from("concept_outcomes")
          .select("id,user_id,video_id,subs_gained")
          .in("status", ["made", "measured"])
          .not("video_id", "is", null);

        if (!rows?.length) return Response.json({ measured: 0 });

        const { getVideoById, getChannelById } = await import("@/lib/youtube.server");

        // Map per-user current subs once
        const userIds = Array.from(new Set(rows.map((r) => r.user_id)));
        const { data: profiles } = await sb
          .from("profiles")
          .select("id, channel_id, subscriber_count")
          .in("id", userIds);
        const subsByUser = new Map<string, number>();
        const baselineByUser = new Map<string, number>();
        for (const p of profiles ?? []) {
          baselineByUser.set(p.id, p.subscriber_count ?? 0);
          let current = p.subscriber_count ?? 0;
          if (p.channel_id) {
            try {
              const ch = await getChannelById(p.channel_id);
              if (ch) current = ch.subscriberCount;
            } catch {}
          }
          subsByUser.set(p.id, current);
        }

        let measured = 0;
        for (const r of rows) {
          if (!r.video_id) continue;
          try {
            const v = await getVideoById(r.video_id);
            if (!v) continue;
            const subs = subsByUser.get(r.user_id) ?? 0;
            const baseline = baselineByUser.get(r.user_id) ?? subs;
            const outlier = subs > 0 ? Number((v.viewCount / Math.max(1, subs)).toFixed(2)) : null;
            await sb
              .from("concept_outcomes")
              .update({
                status: "measured",
                views: v.viewCount,
                outlier_score: outlier,
                subs_gained: Math.max(0, subs - baseline),
                measured_at: new Date().toISOString(),
              })
              .eq("id", r.id);
            measured++;
          } catch (e) {
            console.error("measure failed", r.id, e);
          }
        }

        // refresh profile subscriber counts
        for (const [uid, subs] of subsByUser.entries()) {
          await sb.from("profiles").update({ subscriber_count: subs }).eq("id", uid);
        }

        return Response.json({ measured });
      },
    },
  },
});
