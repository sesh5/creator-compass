import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";

// Public cron endpoint: refreshes stats for every "made" or "measured" concept_outcome.
// Auth: requires a shared CRON_SECRET (private, server-only) as a Bearer token.
export const Route = createFileRoute("/api/public/hooks/measure-outcomes")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const cronSecret = process.env.CRON_SECRET;
        if (!cronSecret) return new Response("Server not configured", { status: 500 });
        const authHeader = request.headers.get("authorization") ?? "";
        const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
        if (!token || token !== cronSecret) {
          return new Response("Unauthorized", { status: 401 });
        }
        const sb = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
          auth: { persistSession: false, autoRefreshToken: false },
        });
        const { data: rows } = await sb
          .from("concept_outcomes")
          .select("id,user_id,project_id,video_id,subs_gained")
          .in("status", ["made", "measured"])
          .not("video_id", "is", null);

        if (!rows?.length) return Response.json({ measured: 0 });

        const { getVideoById, getChannelById } = await import("@/lib/youtube.server");

        // Pull current subs per project (its channel_id, not the profile's).
        const projectIds = Array.from(new Set(rows.map((r: any) => r.project_id).filter(Boolean)));
        const { data: projects } = await sb
          .from("projects")
          .select("id, channel_id, subscriber_count")
          .in("id", projectIds);

        const subsByProject = new Map<string, number>();
        const baselineByProject = new Map<string, number>();
        for (const p of (projects ?? []) as any[]) {
          baselineByProject.set(p.id, p.subscriber_count ?? 0);
          let current = p.subscriber_count ?? 0;
          if (p.channel_id) {
            try {
              const ch = await getChannelById(p.channel_id);
              if (ch) current = ch.subscriberCount;
            } catch {}
          }
          subsByProject.set(p.id, current);
        }

        let measured = 0;
        for (const r of rows as any[]) {
          if (!r.video_id || !r.project_id) continue;
          try {
            const v = await getVideoById(r.video_id);
            if (!v) continue;
            const subs = subsByProject.get(r.project_id) ?? 0;
            const baseline = baselineByProject.get(r.project_id) ?? subs;
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

        // Refresh stored subscriber counts on each project
        for (const [pid, subs] of subsByProject.entries()) {
          await sb.from("projects").update({ subscriber_count: subs }).eq("id", pid);
        }

        return Response.json({ measured });
      },
    },
  },
});
