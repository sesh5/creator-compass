import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { listProjects, deleteProject, setActiveProject } from "@/lib/projects.functions";
import { getMyProfile } from "@/lib/profile.functions";
import { Button } from "@/components/ui/button";
import { PageHeader, formatNumber } from "@/components/Primitives";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { ProjectFormDialog } from "@/components/ProjectFormDialog";
import { FolderKanban, Plus, Check, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/projects")({
  head: () => ({ meta: [{ title: "Projects — CreatorArena" }, { name: "robots", content: "noindex" }] }),
  component: ProjectsPage,
});

function ProjectsPage() {
  const qc = useQueryClient();
  const listFn = useServerFn(listProjects);
  const profileFn = useServerFn(getMyProfile);
  const delFn = useServerFn(deleteProject);
  const setActiveFn = useServerFn(setActiveProject);

  const { data: projects } = useQuery({ queryKey: ["projects"], queryFn: () => listFn() });
  const { data: profile } = useQuery({ queryKey: ["profile"], queryFn: () => profileFn() });

  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<any | null>(null);
  const [toDelete, setToDelete] = useState<any | null>(null);

  const invalidateAll = () => {
    qc.invalidateQueries({ queryKey: ["profile"] });
    qc.invalidateQueries({ queryKey: ["projects"] });
    qc.invalidateQueries({ queryKey: ["watchlist"] });
    qc.invalidateQueries({ queryKey: ["plan"] });
    qc.invalidateQueries({ queryKey: ["outcomes"] });
    qc.removeQueries({ queryKey: ["discover-results"] });
  };

  const switchMut = useMutation({
    mutationFn: (id: string) => setActiveFn({ data: { id } }),
    onSuccess: () => { invalidateAll(); toast.success("Switched project"); },
    onError: (e: any) => toast.error(e?.message ?? "Failed"),
  });

  const delMut = useMutation({
    mutationFn: (id: string) => delFn({ data: { id } }),
    onSuccess: () => { invalidateAll(); toast.success("Project deleted"); setToDelete(null); },
    onError: (e: any) => toast.error(e?.message ?? "Failed"),
  });

  const activeId = profile?.active_project?.id ?? null;

  return (
    <div>
      <PageHeader
        eyebrow="Workspace"
        title="Your projects"
        description="One project per niche or channel. Switch between them to keep competitors, plans, and results separate."
        action={
          <Button onClick={() => setCreating(true)} className="brand-gradient border-0">
            <Plus className="w-4 h-4 mr-2" /> New project
          </Button>
        }
      />

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {(projects ?? []).map((p) => {
          const isActive = p.id === activeId;
          return (
            <div key={p.id} className="surface-card p-5 flex flex-col">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-lg brand-gradient grid place-items-center text-primary-foreground">
                  <FolderKanban className="w-5 h-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-semibold truncate">{p.name}</p>
                    {isActive && <span className="text-[10px] uppercase tracking-wider font-semibold px-1.5 py-0.5 rounded bg-success/15 text-success">Active</span>}
                  </div>
                  {p.channel_title && <p className="text-xs text-muted-foreground truncate">{p.channel_title}</p>}
                  <p className="text-xs text-muted-foreground mt-0.5">{formatNumber(p.subscriber_count ?? 0)} subs</p>
                </div>
              </div>
              {p.niche_keywords && p.niche_keywords.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-1">
                  {p.niche_keywords.map((k: string) => (
                    <span key={k} className="text-[11px] px-2 py-0.5 rounded-full bg-accent text-accent-foreground border">{k}</span>
                  ))}
                </div>
              )}
              <div className="mt-4 flex gap-2 flex-wrap">
                {!isActive && (
                  <Button size="sm" variant="outline" onClick={() => switchMut.mutate(p.id)} disabled={switchMut.isPending}>
                    <Check className="w-3 h-3 mr-1" /> Set active
                  </Button>
                )}
                <Button size="sm" variant="ghost" onClick={() => setEditing(p)}>
                  <Pencil className="w-3 h-3 mr-1" /> Edit
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setToDelete(p)} className="text-destructive hover:text-destructive ml-auto">
                  <Trash2 className="w-3 h-3" />
                </Button>
              </div>
            </div>
          );
        })}
        <button
          onClick={() => setCreating(true)}
          className="surface-card p-5 border-dashed flex flex-col items-center justify-center gap-2 min-h-[180px] hover:border-primary/60 transition-colors"
        >
          <div className="w-10 h-10 rounded-lg bg-muted grid place-items-center">
            <Plus className="w-5 h-5" />
          </div>
          <p className="text-sm font-medium">New project</p>
          <p className="text-xs text-muted-foreground text-center">Track a different niche or channel</p>
        </button>
      </div>

      <ProjectFormDialog open={creating} onOpenChange={setCreating} />
      <ProjectFormDialog open={!!editing} onOpenChange={(o) => { if (!o) setEditing(null); }} existing={editing} />

      <AlertDialog open={!!toDelete} onOpenChange={(o) => { if (!o) setToDelete(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete "{toDelete?.name}"?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently removes the project and all of its watchlist, plans, concepts, and tracked outcomes. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => toDelete && delMut.mutate(toDelete.id)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
