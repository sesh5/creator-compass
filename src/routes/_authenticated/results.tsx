import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getOutcomes, measureMyOutcomes } from "@/lib/plan.functions";
import { Button } from "@/components/ui/button";
import { PageHeader, EmptyState, formatNumber } from "@/components/Primitives";
import { Trophy, RefreshCw, Loader2, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { useEffect, useMemo, useRef } from "react";

export const Route = createFileRoute("/_authenticated/results")({
  head: () => ({ meta: [{ title: "Results — CreatorArena" }, { name: "robots", content: "noindex" }] }),
  component: ResultsPage,
});

function ResultsPage() {
  const qc = useQueryClient();
  const outcomesFn = useServerFn(getOutcomes);
  const measureFn = useServerFn(measureMyOutcomes);

  const { data: outcomes } = useQuery({ queryKey: ["outcomes"], queryFn: () => outcomesFn() });

  const measureMut = useMutation({
    mutationFn: () => measureFn(),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ["outcomes"] });
      const skipped = (r as any).skipped ?? 0;
      if (r.measured === 0 && skipped > 0) {
        toast.error(`Couldn't measure ${skipped} video${skipped === 1 ? "" : "s"}. Check the URL is public.`);
      } else {
        toast.success(`Measured ${r.measured} video${r.measured === 1 ? "" : "s"}${skipped ? ` · skipped ${skipped}` : ""}`);
      }
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed"),
  });

  const made = useMemo(() => (outcomes ?? []).filter((o) => o.status === "made" || o.status === "measured"), [outcomes]);
  const totalSuggested = outcomes?.length ?? 0;
  const totalMade = made.length;
  const totalViews = made.reduce((s, o) => s + (o.views ?? 0), 0);
  const totalSubs = made.reduce((s, o) => s + (o.subs_gained ?? 0), 0);
  const bestOutlier = made.reduce((m, o) => Math.max(m, o.outlier_score ?? 0), 0);

  return (
    <div>
      <PageHeader
        eyebrow="Step 3"
        title="Did it work?"
        description="Track which suggested concepts you made and how each one performed. We refresh stats weekly."
        action={
          <Button onClick={() => measureMut.mutate()} disabled={measureMut.isPending} variant="outline">
            {measureMut.isPending ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Measuring</> : <><RefreshCw className="w-4 h-4 mr-2" />Refresh stats</>}
          </Button>
        }
      />

      {totalMade > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">
          <StatCard label="Made" value={`${totalMade}/${totalSuggested}`} />
          <StatCard label="Total views" value={formatNumber(totalViews)} />
          <StatCard label="Subs gained" value={`+${formatNumber(totalSubs)}`} />
          <StatCard label="Best outlier" value={bestOutlier > 0 ? `${bestOutlier.toFixed(1)}x` : "—"} />
        </div>
      )}

      {totalMade === 0 ? (
        <EmptyState
          icon={<Trophy className="w-5 h-5 text-primary-foreground" />}
          title="No videos tracked yet"
          description="Generate a plan, film a video, then paste its YouTube URL on the plan page to mark it ‘made’. We'll measure it for you."
          action={
            <Link to="/plan">
              <Button>Go to plan</Button>
            </Link>
          }
        />
      ) : (
        <div className="space-y-3">
          {made.map((o) => {
            const c = o.concept_snapshot as any;
            return (
              <div key={o.id} className="surface-card p-5 flex flex-col sm:flex-row gap-4">
                <div className="flex-1 min-w-0">
                  <p className="font-display font-semibold">{c?.hook ?? "Concept"}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Target: {c?.target_keyword}</p>
                  {o.video_url && (
                    <a href={o.video_url} target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center text-sm text-primary hover:underline">
                      {o.video_url} <ExternalLink className="w-3 h-3 ml-1" />
                    </a>
                  )}
                </div>
                <div className="grid grid-cols-3 gap-4 sm:gap-6 text-center sm:text-right">
                  <Metric label="Views" value={formatNumber(o.views ?? null)} />
                  <Metric label="Subs +" value={o.subs_gained != null ? `+${formatNumber(o.subs_gained)}` : "—"} />
                  <Metric label="Outlier" value={o.outlier_score != null ? `${o.outlier_score.toFixed(2)}x` : "—"} highlight={o.outlier_score != null && o.outlier_score >= 1} />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="surface-card p-4">
      <p className="text-xs uppercase tracking-wider font-semibold text-muted-foreground">{label}</p>
      <p className="mt-1 font-display text-2xl font-bold">{value}</p>
    </div>
  );
}

function Metric({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className={`font-display font-bold text-lg ${highlight ? "text-success" : ""}`}>{value}</p>
    </div>
  );
}
