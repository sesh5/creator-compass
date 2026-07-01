import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Sparkles, Compass, FileText, Trophy, ArrowRight } from "lucide-react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "CreatorArena — AI co-pilot for new YouTube creators" },
      {
        name: "description",
        content:
          "Stop guessing what to make next. CreatorArena turns competitor intelligence into a weekly content plan, then tracks whether each video actually grew your channel.",
      },
      { property: "og:title", content: "CreatorArena — AI co-pilot for new YouTube creators" },
      {
        property: "og:description",
        content: "Built for creators 0–1,000 subs. Get told what video to make next, then find out if it worked.",
      },
      { property: "og:type", content: "website" },
      { property: "og:url", content: "https://creatorarena.lovable.app/" },
    ],
    links: [{ rel: "canonical", href: "https://creatorarena.lovable.app/" }],
    scripts: [
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "WebSite",
          name: "CreatorArena",
          url: "https://creatorarena.lovable.app/",
          description:
            "AI co-pilot for new YouTube creators. Plan the next video, then measure if it worked.",
        }),
      },
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "Organization",
          name: "CreatorArena",
          url: "https://creatorarena.lovable.app/",
        }),
      },
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "SoftwareApplication",
          name: "CreatorArena",
          applicationCategory: "BusinessApplication",
          operatingSystem: "Web",
          url: "https://creatorarena.lovable.app/",
          description:
            "AI co-pilot that watches your niche, tells you exactly what video to film this week, and tracks whether each video grew your channel.",
          offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
        }),
      },
    ],
  }),
  beforeLoad: async () => {
    // If signed in, jump to discover
    if (typeof window === "undefined") return;
    const { data } = await supabase.auth.getSession();
    if (data.session) throw redirect({ to: "/discover" });
  },
  component: Landing,
});

function Landing() {
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b">
        <div className="mx-auto max-w-6xl px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2 font-display font-bold text-xl">
            <span className="grid place-items-center w-8 h-8 rounded-lg brand-gradient">
              <Sparkles className="w-4 h-4" />
            </span>
            CreatorArena
          </div>
          <Link to="/auth">
            <Button variant="ghost" size="sm">Sign in</Button>
          </Link>
        </div>
      </header>

      <section className="mx-auto max-w-5xl px-6 pt-16 pb-12 sm:pt-24 sm:pb-20 text-center">
        <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-medium bg-accent text-accent-foreground border">
          <Sparkles className="w-3 h-3" /> For creators 0–1,000 subs
        </span>
        <h1 className="mt-6 font-display text-4xl sm:text-6xl font-bold tracking-tight">
          Stop guessing.<br />
          <span className="bg-clip-text text-transparent" style={{ backgroundImage: "var(--gradient-warm)" }}>
            Make the next video that actually works.
          </span>
        </h1>
        <p className="mt-6 text-lg text-muted-foreground max-w-2xl mx-auto">
          CreatorArena watches what's outperforming in your niche, tells you exactly what to film this week,
          then tracks whether each video grew your channel — so the AI keeps learning what works for you.
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Link to="/auth">
            <Button size="lg" className="brand-gradient border-0 shadow-[var(--shadow-pop)]">
              Get started free <ArrowRight className="w-4 h-4 ml-1" />
            </Button>
          </Link>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-6 pb-24 grid sm:grid-cols-3 gap-4">
        {[
          { icon: Compass, title: "Spy on achievable peers", body: "Find channels 2–5x your size, not the mega-stars. Real benchmarks for where you actually are." },
          { icon: FileText, title: "Get told what to film", body: "5 concrete concepts a week: hook, 3 titles, thumbnail brief, target keyword. No more blank pages." },
          { icon: Trophy, title: "Find out if it worked", body: "Mark a concept ‘made’ and we track the views, the subs, and the outlier score every week." },
        ].map((f) => {
          const Icon = f.icon;
          return (
            <div key={f.title} className="surface-card p-6">
              <div className="w-10 h-10 grid place-items-center rounded-lg brand-gradient mb-4">
                <Icon className="w-5 h-5" />
              </div>
              <h2 className="font-display text-lg font-semibold">{f.title}</h2>
              <p className="mt-2 text-sm text-muted-foreground">{f.body}</p>
            </div>
          );
        })}
      </section>
    </div>
  );
}
