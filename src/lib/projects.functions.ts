import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const ProjectInput = z.object({
  name: z.string().trim().min(1).max(80),
  channel_url: z.string().trim().max(500).optional().nullable(),
  subscriber_count: z.number().int().min(0).max(100_000_000).optional().nullable(),
  niche_keywords: z.array(z.string().trim().min(1).max(40)).min(1).max(8),
  goal: z.enum(["first_1k", "more_views", "monetization"]),
});

export type ProjectInputT = z.infer<typeof ProjectInput>;

/** Returns the user's active project, falling back to the default, or the most recent if none. */
export async function getActiveProject(supabase: any, userId: string) {
  const { data: profile } = await supabase
    .from("profiles")
    .select("active_project_id")
    .eq("id", userId)
    .maybeSingle();
  if (profile?.active_project_id) {
    const { data } = await supabase
      .from("projects")
      .select("*")
      .eq("id", profile.active_project_id)
      .eq("user_id", userId)
      .maybeSingle();
    if (data) return data;
  }
  const { data: fallback } = await supabase
    .from("projects")
    .select("*")
    .eq("user_id", userId)
    .order("is_default", { ascending: false })
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  return fallback ?? null;
}

export const listProjects = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data, error } = await supabase
      .from("projects")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: true });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const createProject = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => ProjectInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { getChannelByHandleOrUrl } = await import("./youtube.server");

    let channel_id: string | null = null;
    let channel_title: string | null = null;
    let subscriber_count = data.subscriber_count ?? 0;
    const channel_url = data.channel_url?.trim() || null;

    if (channel_url) {
      try {
        const ch = await getChannelByHandleOrUrl(channel_url);
        if (ch) {
          channel_id = ch.id;
          channel_title = ch.title;
          if (ch.subscriberCount > 0) subscriber_count = ch.subscriberCount;
        }
      } catch (e) {
        console.error("channel lookup failed", e);
      }
    }

    const { data: created, error } = await supabase
      .from("projects")
      .insert({
        user_id: userId,
        name: data.name,
        channel_url,
        channel_id,
        channel_title,
        subscriber_count,
        niche_keywords: data.niche_keywords,
        goal: data.goal,
        is_default: false,
      } as any)
      .select()
      .single();
    if (error) throw new Error(error.message);

    await supabase.from("profiles").update({ active_project_id: created.id }).eq("id", userId);
    return created;
  });

const UpdateInput = z.object({
  id: z.string().uuid(),
  name: z.string().trim().min(1).max(80).optional(),
  channel_url: z.string().trim().max(500).optional().nullable(),
  subscriber_count: z.number().int().min(0).max(100_000_000).optional(),
  niche_keywords: z.array(z.string().trim().min(1).max(40)).min(1).max(8).optional(),
  goal: z.enum(["first_1k", "more_views", "monetization"]).optional(),
});

export const updateProject = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => UpdateInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { id, ...patch } = data;
    const { getChannelByHandleOrUrl } = await import("./youtube.server");
    const updates: Record<string, any> = { ...patch };

    if (patch.channel_url !== undefined) {
      const url = patch.channel_url?.trim() || null;
      updates.channel_url = url;
      if (url) {
        try {
          const ch = await getChannelByHandleOrUrl(url);
          if (ch) {
            updates.channel_id = ch.id;
            updates.channel_title = ch.title;
            if (ch.subscriberCount > 0 && patch.subscriber_count === undefined) {
              updates.subscriber_count = ch.subscriberCount;
            }
          }
        } catch (e) {
          console.error("channel lookup failed", e);
        }
      } else {
        updates.channel_id = null;
        updates.channel_title = null;
      }
    }

    const { error } = await supabase.from("projects").update(updates).eq("id", id).eq("user_id", userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteProject = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { count } = await supabase
      .from("projects")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId);
    if ((count ?? 0) <= 1) throw new Error("You need at least one project. Create another before deleting this one.");

    const { error } = await supabase.from("projects").delete().eq("id", data.id).eq("user_id", userId);
    if (error) throw new Error(error.message);

    // Repoint active_project_id if we just deleted it
    const { data: profile } = await supabase
      .from("profiles")
      .select("active_project_id")
      .eq("id", userId)
      .maybeSingle();
    if (!profile?.active_project_id) {
      const { data: next } = await supabase
        .from("projects")
        .select("id")
        .eq("user_id", userId)
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();
      if (next) await supabase.from("profiles").update({ active_project_id: next.id }).eq("id", userId);
    }
    return { ok: true };
  });

export const setActiveProject = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    // Verify ownership
    const { data: proj } = await supabase
      .from("projects")
      .select("id")
      .eq("id", data.id)
      .eq("user_id", userId)
      .maybeSingle();
    if (!proj) throw new Error("Project not found");
    const { error } = await supabase.from("profiles").update({ active_project_id: data.id }).eq("id", userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
