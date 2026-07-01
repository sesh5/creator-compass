import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { generateConceptsFromIdea, generatePlan, getLatestPlan, getOutcomes, markConceptMade } from "@/lib/plan.functions";
import { getMyProfile } from "@/lib/profile.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { PageHeader, EmptyState } from "@/components/Primitives";
import { FileText, Loader2, Sparkles, Copy, Check, Video, Trophy, Lightbulb } from "lucide-react";
import { toast } from "sonner";
import { useState } from "react";
import type { Concept, IdeaAnalysis } from "@/lib/plan.functions";

export const Route = createFileRoute("/_authenticated/plan")({
  head: () => ({
    meta: [
      { title: "What to make next — CreatorArena" },
      {
        name: "description",
        content:
          "Your AI-generated weekly plan: five concrete YouTube video concepts with hooks, titles, thumbnail briefs and target keywords, ranked by what's outperforming in your niche.",
      },
      { property: "og:title", content: "What to make next — CreatorArena" },
      {
        property: "og:description",
        content:
          "AI-generated weekly YouTube content plan with hooks, titles, thumbnails and target keywords, tuned to your niche.",
      },
      { property: "og:type", content: "website" },
      { property: "og:url", content: "https://creatorarena.lovable.app/plan" },
      { name: "robots", content: "noindex" },
    ],
    links: [{ rel: "canonical", href: "https://creatorarena.lovable.app/plan" }],
  }),
  component: PlanPage,
});

function PlanPage() {
  const qc = useQueryClient();
  const planFn = useServerFn(getLatestPlan);
  const generateFn = useServerFn(generatePlan);
  const outcomesFn = useServerFn(getOutcomes);
  const markFn = useServerFn(markConceptMade);

  const { data: plan } = useQuery({ queryKey: ["plan"], queryFn: () => planFn() });
  const { data: outcomes } = useQuery({ queryKey: ["outcomes"], queryFn: () => outcomesFn() });

  const generateMut = useMutation({
    mutationFn: () => generateFn(),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["plan"] });
      qc.invalidateQueries({ queryKey: ["outcomes"] });
      toast.success("Fresh plan ready!");
    },
    onError: (e: any) => toast.error(e?.message ?? "Generation failed"),
  });

  const markMut = useMutation({
    mutationFn: (v: { outcome_id: string; video_url: string }) => markFn({ data: v }),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ["outcomes"] });
      const title = r.video_title ? `"${r.video_title}"` : "your video";
      toast.success(
        r.measured
          ? `Locked in: ${title} — stats are live on Results.`
          : `Locked in: ${title}. We'll measure it shortly.`,
      );
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed"),
  });

  const concepts = (plan?.concepts_json as Concept[] | undefined) ?? [];

  return (
    <div>
      <PageHeader
        eyebrow="Step 2"
        title="What to make next"
        description="Five videos to film this week, based on what's outperforming in your niche."
        action={
          <Button onClick={() => generateMut.mutate()} disabled={generateMut.isPending} className="brand-gradient border-0">
            {generateMut.isPending ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Generating</> : <><Sparkles className="w-4 h-4 mr-2" />{plan ? "Generate new plan" : "Generate plan"}</>}
          </Button>
        }
      />

      <IdeaPitcher />


      {!plan && !generateMut.isPending && (
        <EmptyState
          icon={<FileText className="w-5 h-5 text-primary-foreground" />}
          title="No plan yet"
          description="Hit ‘Generate plan’ above. For best results, add a few competitors to your watchlist first."
          action={
            <Link to="/discover">
              <Button variant="outline">Find competitors first</Button>
            </Link>
          }
        />
      )}

      {plan && (
        <div className="space-y-4">
          {concepts.map((c, i) => {
            const outcome = (outcomes ?? []).find((o) => o.content_plan_id === plan.id && o.concept_index === i);
            return (
              <ConceptCard
                key={i}
                concept={c}
                index={i}
                outcome={outcome}
                onMark={(video_url) => markMut.mutate({ outcome_id: outcome!.id, video_url })}
              />
            );
          })}
          <div className="text-center">
            <Link to="/results">
              <Button variant="outline" size="sm"><Trophy className="w-4 h-4 mr-2" /> See results so far</Button>
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}

function ConceptCard({ concept, index, outcome, onMark }: { concept: Concept; index: number; outcome?: any; onMark: (url: string) => void }) {
  const [videoUrl, setVideoUrl] = useState("");
  const [copied, setCopied] = useState(false);
  const isMade = outcome?.status === "made" || outcome?.status === "measured";

  const copy = () => {
    const text = `Concept ${index + 1}\nHook: ${concept.hook}\nTitles:\n${concept.titles.map((t) => `- ${t}`).join("\n")}\nThumbnail: ${concept.thumbnail_brief}\nTarget keyword: ${concept.target_keyword}\nWhy now: ${concept.why_now}`;
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
    toast.success("Plan copied");
  };

  return (
    <div className="surface-card p-5 sm:p-6">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg brand-gradient grid place-items-center text-primary-foreground font-bold text-sm">{index + 1}</div>
          <span className="text-xs px-2 py-0.5 rounded-full bg-accent text-accent-foreground border">{concept.target_keyword}</span>
          {isMade && <span className="text-xs px-2 py-0.5 rounded-full bg-success/15 text-success font-semibold">Made ✓</span>}
        </div>
        <Button size="sm" variant="ghost" onClick={copy} aria-label="Copy concept details">
          {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
        </Button>
      </div>

      <h3 className="mt-4 font-display text-lg font-semibold">{concept.hook}</h3>

      <div className="mt-4 grid md:grid-cols-2 gap-4">
        <div>
          <p className="text-xs uppercase tracking-wider font-semibold text-muted-foreground">Title options</p>
          <ul className="mt-2 space-y-1.5 text-sm">
            {concept.titles.map((t, j) => (
              <li key={j} className="flex gap-2"><span className="text-muted-foreground">{j + 1}.</span><span>{t}</span></li>
            ))}
          </ul>
        </div>
        <div className="space-y-3">
          <div>
            <p className="text-xs uppercase tracking-wider font-semibold text-muted-foreground">Thumbnail brief</p>
            <p className="mt-1 text-sm">{concept.thumbnail_brief}</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wider font-semibold text-muted-foreground">Why now</p>
            <p className="mt-1 text-sm text-muted-foreground">{concept.why_now}</p>
          </div>
        </div>
      </div>

      {!isMade && outcome && (
        <div className="mt-5 pt-5 border-t flex flex-col sm:flex-row gap-2">
          <Input
            placeholder="Paste the YouTube URL when you've made it"
            value={videoUrl}
            onChange={(e) => setVideoUrl(e.target.value)}
          />
          <Button onClick={() => { if (videoUrl) onMark(videoUrl); }} disabled={!videoUrl}>
            <Video className="w-4 h-4 mr-2" /> I made this
          </Button>
        </div>
      )}

      {isMade && outcome?.video_url && (
        <div className="mt-5 pt-5 border-t flex flex-wrap items-center justify-between gap-3 text-sm">
          <a href={outcome.video_url} target="_blank" rel="noreferrer" className="text-primary hover:underline truncate max-w-xs">
            {outcome.video_url}
          </a>
          <div className="flex gap-4 text-xs text-muted-foreground">
            <span>Views: <strong className="text-foreground">{outcome.views?.toLocaleString() ?? "measuring…"}</strong></span>
            {outcome.outlier_score != null && (
              <span>Outlier: <strong className="text-foreground">{outcome.outlier_score}x</strong></span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function IdeaPitcher() {
  const ideaFn = useServerFn(generateConceptsFromIdea);
  const profileFn = useServerFn(getMyProfile);
  const { data: profile } = useQuery({ queryKey: ["profile"], queryFn: () => profileFn() });
  const activeProjectId = (profile as any)?.active_project?.id ?? null;

  const [idea, setIdea] = useState("");
  const [count, setCount] = useState(3);
  const qc = useQueryClient();

  const cacheKey = ["idea-analysis", activeProjectId] as const;
  const cached = qc.getQueryData<{ analysis: IdeaAnalysis; concepts: Concept[] }>(cacheKey as any);

  const mut = useMutation({
    mutationFn: (v: { idea: string; count: number }) => ideaFn({ data: v }),
    onSuccess: (r) => qc.setQueryData(cacheKey as any, r),
    onError: (e: any) => toast.error(e?.message ?? "Failed to analyze idea"),
  });

  const result = (mut.data ?? cached) as { analysis: IdeaAnalysis; concepts: Concept[] } | undefined;

  return (
    <div className="surface-card p-5 sm:p-6 mb-6">
      <div className="flex items-center gap-2 mb-3">
        <div className="w-8 h-8 rounded-lg brand-gradient grid place-items-center text-primary-foreground">
          <Lightbulb className="w-4 h-4" />
        </div>
        <h2 className="font-display text-lg font-semibold">Pitch your own idea</h2>
      </div>
      <p className="text-sm text-muted-foreground mb-3">
        Type a place, topic, or angle you're thinking about. We'll check niche fit and turn it into video concepts.
      </p>
      <Textarea
        value={idea}
        onChange={(e) => setIdea(e.target.value)}
        placeholder="e.g. 'agentic systems using Claude Opus', 'n8n + Supabase workflows', 'self-hosted AI agents'"
        maxLength={300}
        className="mb-3"
      />
      <div className="flex flex-wrap items-center gap-3">
        <label className="text-xs text-muted-foreground flex items-center gap-2">
          Concepts:
          <select
            value={count}
            onChange={(e) => setCount(Number(e.target.value))}
            className="bg-background border rounded px-2 py-1 text-sm"
          >
            {[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        </label>
        <Button
          onClick={() => mut.mutate({ idea: idea.trim(), count })}
          disabled={mut.isPending || idea.trim().length < 3}
          className="brand-gradient border-0"
        >
          {mut.isPending ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Analyzing</> : <><Sparkles className="w-4 h-4 mr-2" />Analyze & suggest</>}
        </Button>
      </div>

      {result && (
        <div className="mt-5 space-y-4">
          <div className="rounded-lg border bg-accent/30 p-4 grid sm:grid-cols-2 gap-3 text-sm">
            <div><p className="text-xs uppercase tracking-wider font-semibold text-muted-foreground">Niche fit</p><p className="mt-1">{result.analysis?.fit}</p></div>
            <div><p className="text-xs uppercase tracking-wider font-semibold text-muted-foreground">Demand</p><p className="mt-1">{result.analysis?.demand}</p></div>
            <div><p className="text-xs uppercase tracking-wider font-semibold text-muted-foreground">Difficulty</p><p className="mt-1">{result.analysis?.difficulty}</p></div>
            <div><p className="text-xs uppercase tracking-wider font-semibold text-muted-foreground">Audience</p><p className="mt-1">{result.analysis?.audience}</p></div>
            {result.analysis?.angle && (
              <div className="sm:col-span-2"><p className="text-xs uppercase tracking-wider font-semibold text-primary">Differentiated angle</p><p className="mt-1">{result.analysis.angle}</p></div>
            )}
          </div>
          {result.concepts.length === 0 ? (
            <p className="text-sm text-muted-foreground italic">No concepts — this idea doesn't fit your niche. Try a different angle.</p>
          ) : (
            <div className="space-y-3">
              {result.concepts.map((c, i) => (
                <ConceptCard key={i} concept={c} index={i} onMark={() => {}} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
