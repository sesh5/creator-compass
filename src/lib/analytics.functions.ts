import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { getActiveProject } from "./projects.functions";

type Snapshot = { hook?: string; target_keyword?: string; titles?: string[] };

export type ProjectAnalytics =
  | { hasProject: false }
  | {
      hasProject: true;
      funnel: { suggested: number; made: number; measured: number; madeRate: number; measuredRate: number };
      totals: { totalViews: number; totalSubsGained: number; avgOutlier: number | null; measuredCount: number };
      keywords: { keyword: string; avgViews: number; count: number }[];
      greatestHits: {
        id: string;
        hook: string;
        views: number;
        subs_gained: number | null;
        outlier_score: number | null;
        video_url: string | null;
        video_id: string | null;
      }[];
    };

export const getProjectAnalytics = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<ProjectAnalytics> => {
    const { supabase, userId } = context;
    const project = await getActiveProject(supabase, userId);
    if (!project) return { hasProject: false };

    const { data, error } = await supabase
      .from("concept_outcomes")
      .select("id, status, views, subs_gained, outlier_score, video_url, video_id, concept_snapshot")
      .eq("project_id", project.id);
    if (error) throw new Error(error.message);

    const rows = data ?? [];
    const suggested = rows.length;
    const made = rows.filter((r) => r.status === "made" || r.status === "measured").length;
    const measuredRows = rows.filter((r) => r.status === "measured");
    const measured = measuredRows.length;

    const totalViews = measuredRows.reduce((s, r) => s + (r.views ?? 0), 0);
    const totalSubsGained = measuredRows.reduce((s, r) => s + (r.subs_gained ?? 0), 0);
    const outlierVals = measuredRows.map((r) => r.outlier_score).filter((v): v is number => v != null);
    const avgOutlier = outlierVals.length ? outlierVals.reduce((s, v) => s + v, 0) / outlierVals.length : null;

    // Keywords grouping
    const kwMap = new Map<string, { display: string; views: number; count: number }>();
    for (const r of measuredRows) {
      const snap = (r.concept_snapshot ?? {}) as Snapshot;
      const raw = (snap.target_keyword ?? "").trim();
      if (!raw) continue;
      const key = raw.toLowerCase();
      const cur = kwMap.get(key);
      if (cur) {
        cur.views += r.views ?? 0;
        cur.count += 1;
      } else {
        kwMap.set(key, { display: raw, views: r.views ?? 0, count: 1 });
      }
    }
    const keywords = Array.from(kwMap.values())
      .map((k) => ({ keyword: k.display, avgViews: k.count ? k.views / k.count : 0, count: k.count }))
      .sort((a, b) => b.avgViews - a.avgViews)
      .slice(0, 10);

    const greatestHits = [...measuredRows]
      .sort((a, b) => (b.views ?? 0) - (a.views ?? 0))
      .slice(0, 20)
      .map((r) => {
        const snap = (r.concept_snapshot ?? {}) as Snapshot;
        return {
          id: r.id,
          hook: snap.hook ?? "Concept",
          views: r.views ?? 0,
          subs_gained: r.subs_gained ?? null,
          outlier_score: r.outlier_score ?? null,
          video_url: r.video_url ?? null,
          video_id: r.video_id ?? null,
        };
      });

    return {
      hasProject: true,
      funnel: {
        suggested,
        made,
        measured,
        madeRate: suggested ? made / suggested : 0,
        measuredRate: made ? measured / made : 0,
      },
      totals: { totalViews, totalSubsGained, avgOutlier, measuredCount: measured },
      keywords,
      greatestHits,
    };
  });
