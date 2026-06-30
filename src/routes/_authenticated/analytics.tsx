import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { getProjectAnalytics } from "@/lib/analytics.functions";
import { PageHeader, EmptyState, formatNumber } from "@/components/Primitives";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { BarChart3, ExternalLink, Sparkles, TrendingUp } from "lucide-react";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";

export const Route = createFileRoute("/_authenticated/analytics")({
  head: () => ({ meta: [{ title: "Analytics — CreatorArena" }, { name: "robots", content: "noindex" }] }),
  component: AnalyticsPage,
});

const chartConfig = {
  avgViews: { label: "Avg views", color: "hsl(var(--primary))" },
} satisfies ChartConfig;

function AnalyticsPage() {
  const fn = useServerFn(getProjectAnalytics);
  const { data, isLoading, isError, refetch } = useQuery({ queryKey: ["project-analytics"], queryFn: () => fn() });

  return (
    <div>
      <PageHeader
        eyebrow="Analytics"
        title="What's Working"
        description="Aggregate growth signals across your active project — see where ideas convert and which topics earn the most views."
      />

      {isLoading ? (
        <LoadingSkeleton />
      ) : isError ? (
        <EmptyState
          icon={<BarChart3 className="w-5 h-5 text-primary-foreground" />}
          title="Couldn't load analytics"
          description="Something went wrong loading your project stats."
          action={<Button onClick={() => refetch()}>Try again</Button>}
        />
      ) : !data || data.hasProject === false ? (
        <EmptyState
          icon={<Sparkles className="w-5 h-5 text-primary-foreground" />}
          title="No active project"
          description="Create or pick a project from the switcher to see analytics."
        />
      ) : (
        <Content data={data} />
      )}
    </div>
  );
}

function Content({ data }: { data: Extract<Awaited<ReturnType<typeof getProjectAnalytics>>, { hasProject: true }> }) {
  const { funnel, totals, keywords, greatestHits } = data;
  const hasMeasured = funnel.measured > 0;
  const hasSuggested = funnel.suggested > 0;

  return (
    <div className="space-y-10">
      {/* 1. Idea funnel */}
      <section>
        <SectionTitle title="Idea funnel" subtitle="How ideas move from suggestion to measured outcome." />
        {!hasSuggested ? (
          <EmptyState
            icon={<Sparkles className="w-5 h-5 text-primary-foreground" />}
            title="No ideas yet"
            description="Generate ideas on the What to make page to start filling the funnel."
            action={<Link to="/plan"><Button>Go to What to make</Button></Link>}
          />
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            <StatCard label="Suggested" value={formatNumber(funnel.suggested)} />
            <StatCard label="Made" value={formatNumber(funnel.made)} />
            <StatCard label="Measured" value={formatNumber(funnel.measured)} />
            <StatCard label="Made rate" value={pct(funnel.madeRate)} hint="made / suggested" />
            <StatCard label="Measured rate" value={pct(funnel.measuredRate)} hint="measured / made" />
          </div>
        )}
      </section>

      {/* 2. Outcome totals */}
      <section>
        <SectionTitle title="Outcome totals" subtitle="Across measured videos in this project." />
        {!hasMeasured ? (
          <MeasuredEmpty />
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <BigStat label="Total views" value={formatNumber(totals.totalViews)} />
            <BigStat label="Subs gained" value={`+${formatNumber(totals.totalSubsGained)}`} />
            <BigStat
              label="Avg outlier"
              value={totals.avgOutlier != null ? `${totals.avgOutlier.toFixed(2)}x` : "—"}
            />
          </div>
        )}
      </section>

      {/* 3. What to make more of */}
      <section>
        <SectionTitle title="What to make more of" subtitle="Average views per concept, grouped by target keyword." />
        {!hasMeasured || keywords.length === 0 ? (
          <MeasuredEmpty />
        ) : (
          <div className="surface-card p-4 sm:p-6">
            <ChartContainer config={chartConfig} className="w-full h-[320px] sm:h-[380px] aspect-auto">
              <BarChart data={keywords} layout="vertical" margin={{ left: 8, right: 24, top: 8, bottom: 8 }}>
                <CartesianGrid horizontal={false} strokeDasharray="3 3" />
                <XAxis type="number" tickFormatter={(v) => formatNumber(Number(v))} />
                <YAxis
                  type="category"
                  dataKey="keyword"
                  width={120}
                  tick={{ fontSize: 12 }}
                  interval={0}
                />
                <ChartTooltip
                  content={
                    <ChartTooltipContent
                      formatter={(value, _name, item) => (
                        <div className="flex flex-col gap-0.5">
                          <span className="text-muted-foreground text-xs">Avg views</span>
                          <span className="font-mono font-medium tabular-nums">
                            {formatNumber(Number(value))}
                          </span>
                          <span className="text-muted-foreground text-xs mt-1">
                            {(item.payload as { count: number }).count} concept
                            {(item.payload as { count: number }).count === 1 ? "" : "s"}
                          </span>
                        </div>
                      )}
                    />
                  }
                />
                <Bar dataKey="avgViews" fill="var(--color-avgViews)" radius={[0, 6, 6, 0]} />
              </BarChart>
            </ChartContainer>
          </div>
        )}
      </section>

      {/* 4. Greatest hits */}
      <section>
        <SectionTitle title="Greatest hits" subtitle="Your measured concepts, ranked by views." />
        {!hasMeasured || greatestHits.length === 0 ? (
          <MeasuredEmpty />
        ) : (
          <div className="surface-card divide-y">
            {greatestHits.map((h, i) => (
              <div key={h.id} className="p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4">
                <div className="flex items-start gap-3 flex-1 min-w-0">
                  <span className="font-display font-bold text-lg text-muted-foreground w-6 shrink-0 tabular-nums">
                    {i + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="font-display font-semibold truncate">{h.hook}</p>
                    <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                      <span>
                        <span className="text-foreground font-medium">{formatNumber(h.views)}</span> views
                      </span>
                      <span>
                        <span className="text-foreground font-medium">
                          {h.subs_gained != null ? `+${formatNumber(h.subs_gained)}` : "—"}
                        </span>{" "}
                        subs
                      </span>
                      <span>
                        <span className="text-foreground font-medium">
                          {h.outlier_score != null ? `${h.outlier_score.toFixed(2)}x` : "—"}
                        </span>{" "}
                        outlier
                      </span>
                    </div>
                  </div>
                </div>
                {h.video_url && (
                  <a
                    href={h.video_url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-sm text-primary hover:underline shrink-0"
                  >
                    Watch <ExternalLink className="w-3 h-3" />
                  </a>
                )}
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function SectionTitle({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="mb-3">
      <h2 className="font-display text-xl font-semibold">{title}</h2>
      {subtitle && <p className="text-sm text-muted-foreground mt-0.5">{subtitle}</p>}
    </div>
  );
}

function StatCard({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="surface-card p-4">
      <p className="text-xs uppercase tracking-wider font-semibold text-muted-foreground">{label}</p>
      <p className="mt-1 font-display text-2xl font-bold">{value}</p>
      {hint && <p className="text-[10px] uppercase tracking-wider text-muted-foreground mt-1">{hint}</p>}
    </div>
  );
}

function BigStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="surface-card p-6">
      <p className="text-xs uppercase tracking-wider font-semibold text-muted-foreground">{label}</p>
      <p className="mt-2 font-display text-3xl sm:text-4xl font-bold">{value}</p>
    </div>
  );
}

function MeasuredEmpty() {
  return (
    <EmptyState
      icon={<TrendingUp className="w-5 h-5 text-primary-foreground" />}
      title="No measured videos yet"
      description="Make and measure your first suggested video to start tracking growth."
      action={<Link to="/results"><Button variant="outline">Go to Results</Button></Link>}
    />
  );
}

function LoadingSkeleton() {
  return (
    <div className="space-y-8">
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-24" />)}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-28" />)}
      </div>
      <Skeleton className="h-80" />
      <Skeleton className="h-64" />
    </div>
  );
}

function pct(v: number) {
  return `${Math.round(v * 100)}%`;
}
