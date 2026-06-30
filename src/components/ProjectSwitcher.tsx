import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { setActiveProject } from "@/lib/projects.functions";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator, DropdownMenuLabel } from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { FolderKanban, Check, Plus, Settings2, ChevronDown } from "lucide-react";
import { ProjectFormDialog } from "@/components/ProjectFormDialog";
import { toast } from "sonner";

type ProjectLite = { id: string; name: string; niche_keywords?: string[] | null };

export function ProjectSwitcher({
  active,
  projects,
}: {
  active: ProjectLite | null;
  projects: ProjectLite[];
}) {
  const qc = useQueryClient();
  const switchFn = useServerFn(setActiveProject);
  const [creating, setCreating] = useState(false);

  const switchMut = useMutation({
    mutationFn: (id: string) => switchFn({ data: { id } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["profile"] });
      qc.invalidateQueries({ queryKey: ["projects"] });
      qc.invalidateQueries({ queryKey: ["watchlist"] });
      qc.invalidateQueries({ queryKey: ["plan"] });
      qc.invalidateQueries({ queryKey: ["outcomes"] });
      qc.removeQueries({ queryKey: ["discover-results"] });
      toast.success("Switched project");
    },
    onError: (e: any) => toast.error(e?.message ?? "Switch failed"),
  });

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" className="h-9 gap-2 rounded-full text-xs font-medium max-w-[180px]">
            <FolderKanban className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate">{active?.name ?? "No project"}</span>
            <ChevronDown className="w-3 h-3 opacity-60 shrink-0" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-64">
          <DropdownMenuLabel className="text-xs text-muted-foreground">Your projects</DropdownMenuLabel>
          {projects.map((p) => {
            const isActive = p.id === active?.id;
            return (
              <DropdownMenuItem
                key={p.id}
                onClick={() => { if (!isActive) switchMut.mutate(p.id); }}
                className="flex items-start gap-2 py-2"
              >
                <Check className={`w-4 h-4 mt-0.5 ${isActive ? "opacity-100" : "opacity-0"}`} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{p.name}</p>
                  {p.niche_keywords && p.niche_keywords.length > 0 && (
                    <p className="text-[11px] text-muted-foreground truncate">{p.niche_keywords.slice(0, 3).join(" · ")}</p>
                  )}
                </div>
              </DropdownMenuItem>
            );
          })}
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => setCreating(true)}>
            <Plus className="w-4 h-4 mr-2" /> New project
          </DropdownMenuItem>
          <Link to="/projects">
            <DropdownMenuItem>
              <Settings2 className="w-4 h-4 mr-2" /> Manage projects
            </DropdownMenuItem>
          </Link>
        </DropdownMenuContent>
      </DropdownMenu>
      <ProjectFormDialog open={creating} onOpenChange={setCreating} />
    </>
  );
}
