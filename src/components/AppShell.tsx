import { Link, useRouter, useRouterState } from "@tanstack/react-router";
import { type ReactNode, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Sparkles, Compass, FileText, Trophy, BarChart3, LogOut, Menu, X, Moon, Sun, ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getMyProfile } from "@/lib/profile.functions";
import { SubsEditor } from "@/components/SubsEditor";
import { ProjectSwitcher } from "@/components/ProjectSwitcher";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

const nav = [
  { to: "/discover", label: "Discover", icon: Compass },
  { to: "/plan", label: "What to make", icon: FileText },
  { to: "/results", label: "Results", icon: Trophy },
  { to: "/analytics", label: "Analytics", icon: BarChart3 },
] as const;

export function AppShell({ children }: { children: ReactNode }) {
  const router = useRouter();
  const qc = useQueryClient();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [dark, setDark] = useState(false);
  const profileFn = useServerFn(getMyProfile);
  const { data: profile } = useQuery({ queryKey: ["profile"], queryFn: () => profileFn() });

  useEffect(() => {
    const saved = localStorage.getItem("ca-theme");
    const isDark = saved === "dark" || (!saved && window.matchMedia("(prefers-color-scheme: dark)").matches);
    setDark(isDark);
    document.documentElement.classList.toggle("dark", isDark);
    setCollapsed(localStorage.getItem("ca-sidebar-collapsed") === "1");
  }, []);

  const toggleTheme = () => {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle("dark", next);
    localStorage.setItem("ca-theme", next ? "dark" : "light");
  };

  const toggleCollapsed = () => {
    setCollapsed((c) => {
      const next = !c;
      localStorage.setItem("ca-sidebar-collapsed", next ? "1" : "0");
      return next;
    });
  };

  const signOut = async () => {
    await qc.cancelQueries();
    qc.clear();
    await supabase.auth.signOut();
    router.navigate({ to: "/auth", replace: true });
  };

  const sidebarWidth = collapsed ? "w-16" : "w-60";

  return (
    <TooltipProvider delayDuration={150}>
      <div className="min-h-screen flex">
        {/* Desktop sidebar */}
        <aside
          className={cn(
            "hidden md:flex flex-col border-r bg-background/80 backdrop-blur-md sticky top-0 h-screen transition-[width] duration-200",
            sidebarWidth,
          )}
        >
          <div className={cn("h-16 flex items-center border-b", collapsed ? "justify-center px-2" : "px-4 justify-between")}>
            <Link to="/discover" className="flex items-center gap-2 font-display font-bold overflow-hidden">
              <span className="grid place-items-center w-8 h-8 rounded-lg brand-gradient shrink-0">
                <Sparkles className="w-4 h-4" />
              </span>
              {!collapsed && <span className="text-lg truncate">CreatorArena</span>}
            </Link>
            {!collapsed && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={toggleCollapsed} aria-label="Collapse sidebar">
                    <ChevronLeft className="w-4 h-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="right">Collapse sidebar</TooltipContent>
              </Tooltip>
            )}
          </div>

          {collapsed && (
            <div className="flex justify-center py-2 border-b">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={toggleCollapsed} aria-label="Expand sidebar">
                    <ChevronRight className="w-4 h-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="right">Expand sidebar</TooltipContent>
              </Tooltip>
            </div>
          )}

          <nav className="flex-1 flex flex-col gap-1 p-2 overflow-y-auto">
            {nav.map((n) => {
              const Icon = n.icon;
              const active = pathname === n.to;
              const linkEl = (
                <Link
                  key={n.to}
                  to={n.to}
                  className={cn(
                    "rounded-lg text-sm font-medium flex items-center gap-3 transition-colors",
                    collapsed ? "justify-center h-10 w-10 mx-auto" : "px-3 py-2",
                    active ? "bg-secondary text-foreground" : "text-muted-foreground hover:text-foreground hover:bg-muted",
                  )}
                >
                  <Icon className="w-4 h-4 shrink-0" />
                  {!collapsed && <span className="truncate">{n.label}</span>}
                </Link>
              );
              return collapsed ? (
                <Tooltip key={n.to}>
                  <TooltipTrigger asChild>{linkEl}</TooltipTrigger>
                  <TooltipContent side="right">{n.label}</TooltipContent>
                </Tooltip>
              ) : (
                linkEl
              );
            })}
          </nav>

          <div className={cn("border-t p-2 flex flex-col gap-2", collapsed && "items-center")}>
            {profile?.onboarded && !collapsed ? (
              <>
                <ProjectSwitcher active={profile.active_project ?? null} projects={profile.projects ?? []} />
                <SubsEditor subs={profile.subscriber_count} variant="pill" />
              </>
            ) : null}
            <div className={cn("flex gap-1", collapsed ? "flex-col items-center" : "items-center justify-between")}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="icon" onClick={toggleTheme} aria-label="Toggle theme">
                    {dark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="right">{dark ? "Light mode" : "Dark mode"}</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="icon" onClick={signOut} aria-label="Sign out">
                    <LogOut className="w-4 h-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="right">Sign out</TooltipContent>
              </Tooltip>
            </div>
          </div>
        </aside>

        {/* Mobile top bar */}
        <div className="flex-1 flex flex-col min-w-0">
          <header className="md:hidden sticky top-0 z-40 backdrop-blur-md bg-background/80 border-b">
            <div className="px-4 h-14 flex items-center justify-between">
              <Link to="/discover" className="flex items-center gap-2 font-display font-bold">
                <span className="grid place-items-center w-7 h-7 rounded-lg brand-gradient">
                  <Sparkles className="w-3.5 h-3.5" />
                </span>
                CreatorArena
              </Link>
              <Button variant="ghost" size="icon" onClick={() => setMobileOpen((o) => !o)} aria-label="Menu">
                {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
              </Button>
            </div>
            {mobileOpen && (
              <div className="border-t px-4 py-2 flex flex-col">
                {nav.map((n) => {
                  const Icon = n.icon;
                  return (
                    <Link
                      key={n.to}
                      to={n.to}
                      onClick={() => setMobileOpen(false)}
                      className="px-3 py-3 rounded-lg text-base font-medium flex items-center gap-3 hover:bg-muted"
                    >
                      <Icon className="w-4 h-4" />
                      {n.label}
                    </Link>
                  );
                })}
                <button
                  onClick={signOut}
                  className="px-3 py-3 rounded-lg text-base font-medium flex items-center gap-3 hover:bg-muted text-left"
                >
                  <LogOut className="w-4 h-4" />
                  Sign out
                </button>
              </div>
            )}
          </header>

          <main className="flex-1">
            <div className="mx-auto max-w-6xl px-4 sm:px-6 py-6 sm:py-10">{children}</div>
          </main>
        </div>

      </div>
    </TooltipProvider>
  );
}
