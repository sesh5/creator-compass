import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery } from "@tanstack/react-query";
import { completeOnboarding, getMyProfile } from "@/lib/profile.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sparkles, Plus, X, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/onboarding")({
  head: () => ({ meta: [{ title: "Welcome to CreatorArena" }, { name: "robots", content: "noindex" }] }),
  component: Onboarding,
});

const GOALS = [
  { id: "first_1k", title: "My first 1,000 subs", desc: "Cross the YPP eligibility line." },
  { id: "more_views", title: "More views", desc: "Pop off with a breakout video." },
  { id: "monetization", title: "Monetize", desc: "Build toward earning from YouTube." },
] as const;

function Onboarding() {
  const router = useRouter();
  const profileFn = useServerFn(getMyProfile);
  const { data: profile } = useQuery({ queryKey: ["profile"], queryFn: () => profileFn() });
  const [step, setStep] = useState(0);
  const [channelUrl, setChannelUrl] = useState("");
  const [kwInput, setKwInput] = useState("");
  const [keywords, setKeywords] = useState<string[]>([]);
  const [goal, setGoal] = useState<(typeof GOALS)[number]["id"] | null>(null);

  useEffect(() => {
    if (profile?.onboarded) router.navigate({ to: "/discover" });
  }, [profile, router]);

  const submit = useServerFn(completeOnboarding);
  const mut = useMutation({
    mutationFn: () => submit({ data: { channel_url: channelUrl || null, niche_keywords: keywords, goal: goal! } }),
    onSuccess: (res) => {
      if (res.channel_title) toast.success(`Found ${res.channel_title} (${res.subscriber_count.toLocaleString()} subs)`);
      router.navigate({ to: "/discover" });
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed to save"),
  });

  const addKeyword = () => {
    const k = kwInput.trim().toLowerCase();
    if (!k || keywords.includes(k) || keywords.length >= 8) return;
    setKeywords([...keywords, k]);
    setKwInput("");
  };

  return (
    <div className="max-w-2xl mx-auto">
      <div className="flex items-center gap-2 mb-6">
        {[0, 1, 2].map((i) => (
          <div key={i} className={cn("h-1.5 flex-1 rounded-full", i <= step ? "brand-gradient" : "bg-muted")} />
        ))}
      </div>

      {step === 0 && (
        <div className="surface-card p-6 sm:p-8">
          <div className="grid place-items-center w-12 h-12 rounded-xl brand-gradient mb-4">
            <Sparkles className="w-5 h-5 text-primary-foreground" />
          </div>
          <h1 className="font-display text-3xl font-bold">Welcome 👋</h1>
          <p className="text-muted-foreground mt-2">First — do you have a YouTube channel yet?</p>
          <div className="mt-6 space-y-2">
            <Label htmlFor="channel">Channel URL or @handle (optional)</Label>
            <Input
              id="channel"
              placeholder="https://youtube.com/@yourchannel"
              value={channelUrl}
              onChange={(e) => setChannelUrl(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">Leave blank if you haven't started one yet.</p>
          </div>
          <div className="mt-8 flex justify-end">
            <Button onClick={() => setStep(1)} className="brand-gradient border-0">Next</Button>
          </div>
        </div>
      )}

      {step === 1 && (
        <div className="surface-card p-6 sm:p-8">
          <h1 className="font-display text-3xl font-bold">Your niche</h1>
          <p className="text-muted-foreground mt-2">3–5 keywords that describe what you make. We'll find peers in this space.</p>
          <div className="mt-6 flex gap-2">
            <Input
              placeholder="e.g. budget travel"
              value={kwInput}
              onChange={(e) => setKwInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addKeyword(); } }}
            />
            <Button type="button" variant="outline" onClick={addKeyword}>
              <Plus className="w-4 h-4" />
            </Button>
          </div>
          <div className="mt-4 flex flex-wrap gap-2 min-h-10">
            {keywords.map((k) => (
              <span key={k} className="inline-flex items-center gap-1 pl-3 pr-1.5 py-1.5 rounded-full bg-accent text-accent-foreground text-sm border">
                {k}
                <button onClick={() => setKeywords(keywords.filter((x) => x !== k))} className="rounded-full hover:bg-background p-0.5">
                  <X className="w-3 h-3" />
                </button>
              </span>
            ))}
            {!keywords.length && <p className="text-sm text-muted-foreground">Add a few to continue.</p>}
          </div>
          <div className="mt-8 flex justify-between">
            <Button variant="ghost" onClick={() => setStep(0)}>Back</Button>
            <Button onClick={() => setStep(2)} disabled={!keywords.length} className="brand-gradient border-0">Next</Button>
          </div>
        </div>
      )}

      {step === 2 && (
        <div className="surface-card p-6 sm:p-8">
          <h1 className="font-display text-3xl font-bold">Pick a goal</h1>
          <p className="text-muted-foreground mt-2">We'll prioritise this when generating ideas.</p>
          <div className="mt-6 grid gap-3">
            {GOALS.map((g) => (
              <button
                key={g.id}
                onClick={() => setGoal(g.id)}
                className={cn(
                  "text-left p-4 rounded-xl border transition-all",
                  goal === g.id ? "border-primary ring-2 ring-primary/30 bg-accent" : "hover:border-primary/50",
                )}
              >
                <p className="font-semibold">{g.title}</p>
                <p className="text-sm text-muted-foreground mt-0.5">{g.desc}</p>
              </button>
            ))}
          </div>
          <div className="mt-8 flex justify-between">
            <Button variant="ghost" onClick={() => setStep(1)}>Back</Button>
            <Button
              onClick={() => mut.mutate()}
              disabled={!goal || mut.isPending}
              className="brand-gradient border-0"
            >
              {mut.isPending ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Setting up</> : "Let's go"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
