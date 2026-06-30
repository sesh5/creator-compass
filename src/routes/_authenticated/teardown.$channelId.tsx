import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { getTeardown } from "@/lib/teardown.functions";
import { PageHeader, formatNumber } from "@/components/Primitives";
import { Button } from "@/components/ui/button";
import { Loader2, ExternalLink, TrendingUp, TrendingDown, FileText } from "lucide-react";

export const Route = createFileRoute("/_authenticated/teardown/$channelId")({
  head: () => ({ meta: [{ title: "Channel teardown — CreatorArena" }, { name: "robots", content: "noindex" }] }),
  component: TeardownPage,
});

function TeardownPage() {
  const { channelId } = Route.useParams();
  const teardownFn = useServerFn(getTeardown);
  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ["teardown", channelId],
    queryFn: () => teardownFn({ data: { channel_id: channelId } }),
    staleTime: 1000 * 60 * 60,
  });

  if (isLoading) {
    return (
      <div className="grid place-items-center min-h-[60vh]">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin mx-auto text-primary" />
          <p className="mt-4 text-muted-foreground">Watching their channel… this can take 20–30 seconds.</p>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="surface-card p-8 text-center">
        <p className="text-destructive font-semibold">Teardown failed</p>
        <p className="text-sm text-muted-foreground mt-1">{(error as Error)?.message ?? "Unknown error"}</p>
        <Button onClick={() => refetch()} className="mt-4">Try again</Button>
      </div>
    );
  }

  const t = data.teardown;
  const outliers = data.outliers;

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Teardown"
        title={data.channel_name}
        description={`${formatNumber(data.subscriber_count)} subscribers · cached for 7 days`}
        action={
          <Link to="/plan">
            <Button className="brand-gradient border-0"><FileText className="w-4 h-4 mr-2" /> Plan my next video</Button>
          </Link>
        }
      />

      <section className="surface-card p-6">
        <h2 className="font-display text-xl font-semibold">Why this channel is winning</h2>
        <p className="mt-2 text-muted-foreground">{t.why_winning}</p>
        <div className="mt-5 grid sm:grid-cols-2 lg:grid-cols-3 gap-3 text-sm">
          <Stat label="Cadence" value={t.cadence} />
          <Stat label="Typical length" value={t.typical_length} />
          <Stat label="Hook style" value={t.hook_style} />
          <Stat label="Title patterns" value={t.title_patterns} />
          <Stat label="Thumbnails" value={t.thumbnail_approach} />
        </div>
        {t.content_pillars?.length > 0 && (
          <div className="mt-5">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Content pillars</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {t.content_pillars.map((p) => (
                <span key={p} className="px-3 py-1 rounded-full text-sm bg-accent text-accent-foreground border">{p}</span>
              ))}
            </div>
          </div>
        )}
      </section>

      <section className="grid md:grid-cols-2 gap-4">
        <BestWorst icon={<TrendingUp className="w-4 h-4" />} label="Best video" video={t.best_video} variant="success" />
        <BestWorst icon={<TrendingDown className="w-4 h-4" />} label="Worst video" video={t.worst_video} variant="destructive" />
      </section>

      <section>
        <h2 className="font-display text-xl font-semibold mb-3">Top outliers</h2>
        <p className="text-sm text-muted-foreground mb-4">Outlier score = video views ÷ subscriber count. Anything &gt; 1.0 is a breakout.</p>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {outliers.map((v) => (
            <a key={v.video_id} href={`https://youtube.com/watch?v=${v.video_id}`} target="_blank" rel="noreferrer" className="surface-card overflow-hidden hover:shadow-lg transition-shadow">
              {v.thumbnail && <img src={v.thumbnail} alt="" className="w-full aspect-video object-cover" />}
              <div className="p-4">
                <p className="font-medium text-sm line-clamp-2">{v.title}</p>
                <div className="mt-3 flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">{formatNumber(v.views)} views</span>
                  <span className="px-2 py-0.5 rounded-full bg-success/15 text-success font-semibold">{v.outlier_score}x</span>
                </div>
              </div>
            </a>
          ))}
        </div>
        <div className="mt-4 text-right">
          <Button variant="ghost" size="sm" onClick={() => refetch()} disabled={isFetching}>
            {isFetching ? "Refreshing…" : "Refresh teardown"}
          </Button>
        </div>
      </section>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wider font-semibold text-muted-foreground">{label}</p>
      <p className="mt-1">{value}</p>
    </div>
  );
}

function BestWorst({ icon, label, video, variant }: { icon: React.ReactNode; label: string; video: { title: string; video_id: string; views: number; why: string }; variant: "success" | "destructive" }) {
  return (
    <div className="surface-card p-5">
      <div className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2 py-1 rounded-full ${variant === "success" ? "bg-success/15 text-success" : "bg-destructive/15 text-destructive"}`}>
        {icon} {label}
      </div>
      <h3 className="mt-3 font-semibold">{video.title}</h3>
      <p className="text-xs text-muted-foreground mt-1">{formatNumber(video.views)} views</p>
      <p className="mt-3 text-sm text-muted-foreground">{video.why}</p>
      {video.video_id && (
        <a href={`https://youtube.com/watch?v=${video.video_id}`} target="_blank" rel="noreferrer" className="mt-3 inline-flex items-center text-xs text-primary hover:underline">
          Watch <ExternalLink className="w-3 h-3 ml-1" />
        </a>
      )}
    </div>
  );
}
