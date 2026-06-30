import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery } from "@tanstack/react-query";
import { getMyProfile } from "@/lib/profile.functions";
import { discoverCompetitors, addToWatchlist, removeFromWatchlist, getWatchlist, searchCompetitorByQuery } from "@/lib/discovery.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PageHeader, EmptyState, formatNumber } from "@/components/Primitives";
import { Compass, Loader2, Plus, Check, Sparkles, Search } from "lucide-react";
import { toast } from "sonner";
import { SubsEditor } from "@/components/SubsEditor";


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
  const searchFn = useServerFn(searchCompetitorByQuery);
  const [manualQuery, setManualQuery] = useState("");
  const [submittedQuery, setSubmittedQuery] = useState("");


  const { data: profile } = useQuery({ queryKey: ["profile"], queryFn: () => profileFn() });

  useEffect(() => {
    if (profile && !profile.onboarded) router.navigate({ to: "/onboarding" });
  }, [profile, router]);

  const { data: watchlist, refetch: refetchWatch } = useQuery({ queryKey: ["watchlist"], queryFn: () => watchFn() });
  const watchedIds = new Set((watchlist ?? []).map((w) => w.competitor_channel_id));

  const activeProjectId = (profile as any)?.active_project?.id ?? null;
  const discoverQ = useQuery({
    queryKey: ["discover-results", activeProjectId],
    queryFn: () => discoverFn(),
    enabled: false,
    staleTime: Infinity,
    gcTime: Infinity,
    retry: false,
  });
  useEffect(() => {
    if (discoverQ.error) toast.error((discoverQ.error as any)?.message ?? "Discovery failed");
  }, [discoverQ.error]);

  const manualQ = useQuery({
    queryKey: ["manual-search", submittedQuery],
    queryFn: () => searchFn({ data: { query: submittedQuery } }),
    enabled: !!submittedQuery,
    staleTime: Infinity,
    gcTime: Infinity,
    retry: false,
  });
  useEffect(() => {
    if (manualQ.error) toast.error((manualQ.error as any)?.message ?? "Search failed");
  }, [manualQ.error]);

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

  const result = discoverQ.data;
  const competitors = result?.competitors as any[] | undefined;
  const isSearching = discoverQ.isFetching;

  return (
    <div>
      <PageHeader
        eyebrow="Step 1"
        title="Who are your achievable peers?"
        description={
          result
            ? `Ranked niche peers for ${formatNumber(result.user_subs)} subs — ${result.band_label}, on-niche only.`
            : profile?.subscriber_count
              ? `We'll search the full growth ladder around ${formatNumber(profile.subscriber_count)} subs, strictly in your niche.`
              : "We'll search your growth ladder, strictly in your niche."
        }
        action={
          <div className="flex items-center gap-3">
            {profile?.onboarded ? (
              <div className="hidden md:block">
                <SubsEditor subs={profile.subscriber_count} variant="link" />
              </div>
            ) : null}
            <Button onClick={() => discoverQ.refetch()} disabled={isSearching} className="brand-gradient border-0">
              {isSearching ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Searching</> : <><Compass className="w-4 h-4 mr-2" />Find competitors</>}
            </Button>
          </div>
        }
      />

      <section className="mb-10 surface-card p-4">
        <h2 className="font-display text-base font-semibold mb-1">Add a competitor manually</h2>
        <p className="text-xs text-muted-foreground mb-3">Paste a YouTube URL, @handle, or channel name — even if it's not in the suggested list.</p>
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            const q = manualQuery.trim();
            if (q) setSubmittedQuery(q);
          }}
        >
          <Input
            placeholder="e.g. @NateHerk, https://youtube.com/@…, or 'AI automation'"
            value={manualQuery}
            onChange={(e) => setManualQuery(e.target.value)}
          />
          <Button type="submit" disabled={manualQ.isFetching || !manualQuery.trim()}>
            {manualQ.isFetching ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Search className="w-4 h-4 mr-1" />Search</>}
          </Button>
        </form>

        {manualQ.data && (
          <div className="mt-4">
            {manualQ.data.results.length === 0 ? (
              <p className="text-sm text-muted-foreground">No channels found for "{manualQ.data.query}".</p>
            ) : (
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {manualQ.data.results.map((c) => {
                  const isAdded = watchedIds.has(c.channel_id);
                  return (
                    <div key={c.channel_id} className="border rounded-lg p-3 flex gap-3">
                      {c.thumbnail_url ? (
                        <img src={c.thumbnail_url} alt="" className="w-10 h-10 rounded-full object-cover" />
                      ) : (
                        <div className="w-10 h-10 rounded-full bg-muted" />
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-sm truncate">{c.channel_name}</p>
                        <p className="text-xs text-muted-foreground">{formatNumber(c.subscriber_count)} subs</p>
                        <div className="mt-2 flex gap-2 flex-wrap">
                          <Button
                            size="sm"
                            variant={isAdded ? "outline" : "default"}
                            onClick={() => isAdded ? removeMut.mutate(c.channel_id) : addMut.mutate({ ...c, niche_tag: "manual", why_watch: "Added manually" })}
                            disabled={addMut.isPending}
                          >
                            {isAdded ? <><Check className="w-3 h-3 mr-1" />Added</> : <><Plus className="w-3 h-3 mr-1" />Watchlist</>}
                          </Button>
                          <Link to="/teardown/$channelId" params={{ channelId: c.channel_id }}>
                            <Button size="sm" variant="ghost">
                              <Sparkles className="w-3 h-3 mr-1" />Teardown
                            </Button>
                          </Link>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </section>


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

      {!competitors && !isSearching && (
        <EmptyState
          icon={<Compass className="w-5 h-5 text-primary-foreground" />}
          title="Let's find your peers"
          description={
            watchlist && watchlist.length
              ? "Hit ‘Find competitors’ above to refresh suggestions in your niche."
              : "Tap ‘Find competitors’ above. We'll search YouTube for channels in your niche that are 2x–5x your size."
          }
        />
      )}

      {competitors && (
        <section>
          <h2 className="font-display text-lg font-semibold mb-3">
            Suggested competitors {competitors.length > 0 ? `(${competitors.length})` : ""}
          </h2>
          {competitors.length === 0 ? (
            <EmptyState
              title="No on-niche channels in that band"
              description={`Nothing matched the ${result?.band_label} range for your niche. Try refining your niche keywords in Onboarding — more specific terms give better matches.`}
            />
          ) : (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {competitors.map((c, index) => {
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
                        <p className="font-semibold truncate"><span className="text-primary mr-1">#{index + 1}</span>{c.channel_name}</p>
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
