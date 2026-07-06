import { auth, defineMcp } from "@lovable.dev/mcp-js";
import listProjects from "./tools/list-projects";
import listWatchlist from "./tools/list-watchlist";
import listContentPlans from "./tools/list-content-plans";
import getTeardown from "./tools/get-teardown";

// The OAuth issuer must be the direct Supabase host, not the .lovable.cloud
// proxy that SUPABASE_URL is rewritten to on publish. VITE_SUPABASE_PROJECT_ID
// is inlined by Vite at build time and survives publish unchanged.
const projectRef = import.meta.env.VITE_SUPABASE_PROJECT_ID ?? "project-ref-unset";

export default defineMcp({
  name: "creatorarena-mcp",
  title: "CreatorArena",
  version: "0.1.0",
  instructions:
    "Access the signed-in user's CreatorArena YouTube growth workspace. Use list_projects to discover projects, list_watchlist to see competitor channels the user tracks, list_content_plans to read the user's AI-generated weekly video plans, and get_teardown to read the cached teardown analysis for a channel the user tracks.",
  auth: auth.oauth.issuer({
    issuer: `https://${projectRef}.supabase.co/auth/v1`,
    acceptedAudiences: "authenticated",
  }),
  tools: [listProjects, listWatchlist, listContentPlans, getTeardown],
});
