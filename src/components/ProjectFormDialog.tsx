import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { createProject, updateProject } from "@/lib/projects.functions";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Plus, X, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const GOALS = [
  { id: "first_1k", title: "First 1,000 subs" },
  { id: "more_views", title: "More views" },
  { id: "monetization", title: "Monetize" },
] as const;

type Goal = (typeof GOALS)[number]["id"];

export function ProjectFormDialog({
  open,
  onOpenChange,
  existing,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  existing?: {
    id: string;
    name: string;
    channel_url?: string | null;
    subscriber_count?: number | null;
    niche_keywords?: string[] | null;
    goal?: string | null;
  } | null;
}) {
  const qc = useQueryClient();
  const createFn = useServerFn(createProject);
  const updateFn = useServerFn(updateProject);
  const isEdit = !!existing;

  const [name, setName] = useState("");
  const [channelUrl, setChannelUrl] = useState("");
  const [subCount, setSubCount] = useState("");
  const [kwInput, setKwInput] = useState("");
  const [keywords, setKeywords] = useState<string[]>([]);
  const [goal, setGoal] = useState<Goal>("first_1k");

  useEffect(() => {
    if (open) {
      setName(existing?.name ?? "");
      setChannelUrl(existing?.channel_url ?? "");
      setSubCount(existing?.subscriber_count != null ? String(existing.subscriber_count) : "");
      setKeywords(existing?.niche_keywords ?? []);
      setGoal((existing?.goal as Goal) ?? "first_1k");
      setKwInput("");
    }
  }, [open, existing]);

  const mut = useMutation<any, Error, void>({
    mutationFn: async () => {
      const subs = subCount.trim() === "" ? null : Math.max(0, Math.floor(Number(subCount.replace(/,/g, "")) || 0));
      if (isEdit) {
        return updateFn({
          data: {
            id: existing!.id,
            name: name.trim(),
            channel_url: channelUrl.trim() || null,
            subscriber_count: subs ?? 0,
            niche_keywords: keywords,
            goal,
          },
        });
      }
      return createFn({
        data: {
          name: name.trim() || keywords[0] || "New project",
          channel_url: channelUrl.trim() || null,
          subscriber_count: subs,
          niche_keywords: keywords,
          goal,
        },
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["profile"] });
      qc.invalidateQueries({ queryKey: ["projects"] });
      qc.invalidateQueries({ queryKey: ["watchlist"] });
      qc.invalidateQueries({ queryKey: ["plan"] });
      qc.invalidateQueries({ queryKey: ["outcomes"] });
      qc.removeQueries({ queryKey: ["discover-results"] });
      toast.success(isEdit ? "Project updated" : "Project created");
      onOpenChange(false);
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed"),
  });

  const addKeyword = () => {
    const k = kwInput.trim().toLowerCase();
    if (!k || keywords.includes(k) || keywords.length >= 8) return;
    setKeywords([...keywords, k]);
    setKwInput("");
  };

  const valid = name.trim().length > 0 && keywords.length > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit project" : "New project"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="pname">Project name</Label>
            <Input id="pname" placeholder="e.g. Travel vlog, Tech trends" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="purl">Channel URL or @handle (optional)</Label>
            <Input id="purl" placeholder="https://youtube.com/@yourchannel" value={channelUrl} onChange={(e) => setChannelUrl(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="psubs">Subscriber count</Label>
            <Input id="psubs" type="number" inputMode="numeric" min={0} placeholder="0" value={subCount} onChange={(e) => setSubCount(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Niche keywords</Label>
            <div className="flex gap-2">
              <Input
                placeholder="e.g. budget travel"
                value={kwInput}
                onChange={(e) => setKwInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addKeyword();
                  }
                }}
              />
              <Button type="button" variant="outline" onClick={addKeyword}>
                <Plus className="w-4 h-4" />
              </Button>
            </div>
            <div className="flex flex-wrap gap-1.5 min-h-8">
              {keywords.map((k) => (
                <span key={k} className="inline-flex items-center gap-1 pl-2.5 pr-1 py-1 rounded-full bg-accent text-accent-foreground text-xs border">
                  {k}
                  <button onClick={() => setKeywords(keywords.filter((x) => x !== k))} className="rounded-full hover:bg-background p-0.5">
                    <X className="w-3 h-3" />
                  </button>
                </span>
              ))}
            </div>
          </div>
          <div className="space-y-2">
            <Label>Goal</Label>
            <div className="grid grid-cols-3 gap-2">
              {GOALS.map((g) => (
                <button
                  key={g.id}
                  type="button"
                  onClick={() => setGoal(g.id)}
                  className={cn(
                    "text-xs p-2 rounded-lg border transition-colors",
                    goal === g.id ? "border-primary bg-accent" : "hover:border-primary/50",
                  )}
                >
                  {g.title}
                </button>
              ))}
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={() => mut.mutate()} disabled={!valid || mut.isPending} className="brand-gradient border-0">
            {mut.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
            {isEdit ? "Save" : "Create project"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
