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
  name: "get_teardown",
  title: "Get channel teardown",
  description:
    "Return the cached AI teardown analysis (why it wins, cadence, hooks, title patterns, content pillars, outlier videos) for a YouTube channel. Only channels the user has previously torn down in CreatorArena are available.",
  inputSchema: {
    channel_id: z.string().min(1).describe("YouTube channel ID (e.g. UCxxxxxxxx)."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ channel_id }, ctx) => {
    if (!ctx.isAuthenticated())
      return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    // cached_research is scoped by channel_id (shared cache). Only expose it
    // if the signed-in user actually has this channel on a watchlist or as
    // their own project channel — never leak arbitrary cache rows.
    const sb = supabaseForUser(ctx);
    const uid = ctx.getUserId();
    const [{ data: onWatchlist }, { data: onProject }] = await Promise.all([
      sb
        .from("watchlist")
        .select("id")
        .eq("user_id", uid)
        .eq("competitor_channel_id", channel_id)
        .limit(1),
      sb
        .from("projects")
        .select("id")
        .eq("user_id", uid)
        .eq("channel_id", channel_id)
        .limit(1),
    ]);
    const allowed = (onWatchlist?.length ?? 0) > 0 || (onProject?.length ?? 0) > 0;
    if (!allowed) {
      return {
        content: [
          {
            type: "text",
            text: "You don't have this channel on any project or watchlist. Add it in CreatorArena first, then run the teardown.",
          },
        ],
        isError: true,
      };
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("cached_research")
      .select("channel_id, channel_name, subscriber_count, teardown_json, outlier_videos_json, fetched_at")
      .eq("channel_id", channel_id)
      .maybeSingle();
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    if (!data)
      return {
        content: [
          { type: "text", text: "No teardown cached yet. Open the channel in CreatorArena to generate one." },
        ],
        isError: true,
      };
    return {
      content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
      structuredContent: { teardown: data },
    };
  },
});
