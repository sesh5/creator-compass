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
  name: "list_content_plans",
  title: "List content plans",
  description:
    "List AI-generated weekly content plans (video concepts, hooks, titles, thumbnails) the user has generated for a project. Newest first.",
  inputSchema: {
    project_id: z.string().uuid().describe("Project ID from list_projects."),
    limit: z.number().int().min(1).max(20).optional().describe("Max plans to return (default 5)."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ project_id, limit }, ctx) => {
    if (!ctx.isAuthenticated())
      return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    const { data, error } = await supabaseForUser(ctx)
      .from("content_plans")
      .select("id, concepts_json, source_competitors, created_at")
      .eq("user_id", ctx.getUserId())
      .eq("project_id", project_id)
      .order("created_at", { ascending: false })
      .limit(limit ?? 5);
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    return {
      content: [{ type: "text", text: JSON.stringify(data ?? [], null, 2) }],
      structuredContent: { plans: data ?? [] },
    };
  },
});
