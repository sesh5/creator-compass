import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useEffect } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery } from "@tanstack/react-query";
import { getMyProfile } from "@/lib/profile.functions";
import { discoverCompetitors, addToWatchlist, removeFromWatchlist, getWatchlist } from "@/lib/discovery.functions";
import { Button } from "@/components/ui/button";
import { PageHeader, EmptyState, formatNumber } from "@/components/Primitives";
import { Compass, Loader2, Plus, Check, ExternalLink, Sparkles } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/discover")({
  head: () => ({ meta: [{ title: "Discover competitors — CreatorArena" }, { name: "robots", content: "noindex" }] }),
  component: Discover,
});

function Discover() {
  const router = useRouter();
  const profileFn = useServerFn(getMyProfile);
  const watchFn = useServerFn(getWatchlist);
  const discoverFn = useServerFn(discoverCompetitors);
  const addFn = useServerFn(addToWatchlist);
  const removeFn = useServerFn(removeFromWatchlist);

  const { data: profile } = useQuery({ queryKey: ["profile"], queryFn: () => profileFn() });

  useEffect(() => {
    if (profile && !profile.onboarded) router.navigate({ to: "/onboarding" });
  }, [profile, router]);

  const { data: watchlist, refetch: refetchWatch } = useQuery({ queryKey: ["watchlist"], queryFn: () => watchFn() });
  const watchedIds = new Set((watchlist ?? []).map((w) => w.competitor_channel_id));

  const discoverMut = useMutation({
    mutationFn: () => discoverFn(),
    onError: (e: any) => toast.error(e?.message ?? "Discovery failed"),
  });

  const addMut = useMutation({
    mutationFn: (c: any) =>
      addFn({
        data: {
          channel_id: c.channel_id,
          channel_name: c.channel_name,
          subscriber_count: c.subscriber_count,
          thumbnail_url: c.thumbnail_url,
          niche_tag: c.niche_tag,
          why_watch: c.why_watch,
        },
      }),
    onSuccess: () => { refetchWatch(); toast.success("Added to watchlist"); },
    onError: (e: any) => toast.error(e?.message ?? "Failed to add"),
  });

  const removeMut = useMutation({
    mutationFn: (channel_id: string) => removeFn({ data: { channel_id } }),
    onSuccess: () => refetchWatch(),
  });

  const competitors = discoverMut.data;

  return (
    <div>
      <PageHeader
        eyebrow="Step 1"
        title="Who are your achievable peers?"
        description={
          profile?.subscriber_count
            ? `We'll find channels 2–8x your size (${formatNumber(profile.subscriber_count)} subs) so the benchmarks are real.`
            : "We'll find achievable peers in your niche (50K–2M subs)."
        }
        action={
          <Button onClick={() => discoverMut.mutate()} disabled={discoverMut.isPending} className="brand-gradient border-0">
            {discoverMut.isPending ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Searching</> : <><Compass className="w-4 h-4 mr-2" />Find competitors</>}
          </Button>
        }
      />

      {watchlist && watchlist.length > 0 && (
        <section className="mb-10">
          <h2 className="font-display text-lg font-semibold mb-3">Your watchlist</h2>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {watchlist.map((w) => (
              <div key={w.id} className="surface-card p-4 flex gap-3">
                {w.thumbnail_url ? (
                  <img src={w.thumbnail_url} alt="" className="w-12 h-12 rounded-full object-cover" />
                ) : (
                  <div className="w-12 h-12 rounded-full bg-muted" />
                )}
                <div className="flex-1 min-w-0">
                  <p className="font-semibold truncate">{w.channel_name}</p>
                  <p className="text-xs text-muted-foreground">{formatNumber(w.subscriber_count)} subs</p>
                  <div className="mt-3 flex gap-2">
                    <Link to="/teardown/$channelId" params={{ channelId: w.competitor_channel_id }}>
                      <Button size="sm" variant="outline">
                        <Sparkles className="w-3 h-3 mr-1" /> Teardown
                      </Button>
                    </Link>
                    <Button size="sm" variant="ghost" onClick={() => removeMut.mutate(w.competitor_channel_id)}>Remove</Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {!competitors && !discoverMut.isPending && (
        <EmptyState
          icon={<Compass className="w-5 h-5 text-primary-foreground" />}
          title="Let's find your peers"
          description={
            watchlist && watchlist.length
              ? "Hit ‘Find competitors’ above to refresh suggestions in your niche."
              : "Tap ‘Find competitors’ above. We'll search YouTube for channels in your niche that are 2–8x your size."
          }
        />
      )}

      {competitors && (
        <section>
          <h2 className="font-display text-lg font-semibold mb-3">Suggested competitors</h2>
          {competitors.length === 0 ? (
            <EmptyState
              title="No matches in that size range"
              description="Try editing your niche keywords. Most niches have small-but-growing channels — we just need the right search terms."
            />
          ) : (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {competitors.map((c) => {
                const isAdded = watchedIds.has(c.channel_id);
                return (
                  <div key={c.channel_id} className="surface-card p-5 flex flex-col">
                    <div className="flex gap-3">
                      {c.thumbnail_url ? (
                        <img src={c.thumbnail_url} alt="" className="w-12 h-12 rounded-full object-cover" />
                      ) : (
                        <div className="w-12 h-12 rounded-full bg-muted" />
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold truncate">{c.channel_name}</p>
                        <p className="text-xs text-muted-foreground">{formatNumber(c.subscriber_count)} subs · {formatNumber(c.view_count)} views</p>
                      </div>
                    </div>
                    <span className="mt-3 self-start text-xs px-2 py-0.5 rounded-full bg-accent text-accent-foreground border">{c.niche_tag}</span>
                    <p className="mt-3 text-sm text-muted-foreground flex-1">{c.why_watch}</p>
                    <div className="mt-4 flex gap-2">
                      <Button
                        size="sm"
                        variant={isAdded ? "outline" : "default"}
                        onClick={() => isAdded ? removeMut.mutate(c.channel_id) : addMut.mutate(c)}
                        disabled={addMut.isPending}
                      >
                        {isAdded ? <><Check className="w-3 h-3 mr-1" /> Added</> : <><Plus className="w-3 h-3 mr-1" /> Watchlist</>}
                      </Button>
                      <Link to="/teardown/$channelId" params={{ channelId: c.channel_id }}>
                        <Button size="sm" variant="ghost">
                          <Sparkles className="w-3 h-3 mr-1" /> Teardown
                        </Button>
                      </Link>
                      <a href={`https://www.youtube.com/channel/${c.channel_id}`} target="_blank" rel="noreferrer" className="ml-auto">
                        <Button size="sm" variant="ghost"><ExternalLink className="w-3 h-3" /></Button>
                      </a>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      )}
    </div>
  );
}
