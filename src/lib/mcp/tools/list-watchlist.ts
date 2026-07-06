import { createClient } from "@supabase/supabase-js";
import { defineTool, type ToolContext } from "@lovable.dev/mcp-js";
import { z } from "zod";

function supabaseForUser(ctx: ToolContext) {
  return createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_PUBLISHABLE_KEY!, {
    global: { headers: { Authorization: `Bearer ${ctx.getToken()}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export default defineTool({
  name: "list_watchlist",
  title: "List watchlist",
  description:
    "List the competitor YouTube channels the signed-in user is watching for a given project. Pass the project_id from list_projects.",
  inputSchema: {
    project_id: z.string().uuid().describe("Project ID from list_projects."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ project_id }, ctx) => {
    if (!ctx.isAuthenticated())
      return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    const { data, error } = await supabaseForUser(ctx)
      .from("watchlist")
      .select(
        "id, competitor_channel_id, channel_name, subscriber_count, niche_tag, why_watch, added_at",
      )
      .eq("user_id", ctx.getUserId())
      .eq("project_id", project_id)
      .order("added_at", { ascending: false });
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    return {
      content: [{ type: "text", text: JSON.stringify(data ?? [], null, 2) }],
      structuredContent: { watchlist: data ?? [] },
    };
  },
});
