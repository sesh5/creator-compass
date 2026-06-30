import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { getActiveProject } from "./projects.functions";

const OnboardingInput = z.object({
  channel_url: z.string().trim().max(500).optional().nullable(),
  subscriber_count: z.number().int().min(0).max(100_000_000).optional().nullable(),
  niche_keywords: z.array(z.string().trim().min(1).max(40)).max(8),
  goal: z.enum(["first_1k", "more_views", "monetization"]),
});

export const completeOnboarding = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => OnboardingInput.parse(data))
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

    const projectName = channel_title || data.niche_keywords[0] || "My channel";

    // Create the first project
    const { data: project, error: projErr } = await supabase
      .from("projects")
      .insert({
        user_id: userId,
        name: projectName,
        channel_url,
        channel_id,
        channel_title,
        subscriber_count,
        niche_keywords: data.niche_keywords,
        goal: data.goal,
        is_default: true,
      } as any)
      .select()
      .single();
    if (projErr) throw new Error(projErr.message);

    const { error } = await supabase
      .from("profiles")
      .update({
        channel_url,
        channel_id,
        channel_title,
        subscriber_count,
        niche_keywords: data.niche_keywords,
        goal: data.goal,
        onboarded: true,
        active_project_id: project.id,
      })
      .eq("id", userId);

    if (error) throw new Error(error.message);
    return { ok: true, channel_id, channel_title, subscriber_count, project_id: project.id };
  });

export const getMyProfile = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data: profile, error } = await supabase.from("profiles").select("*").eq("id", userId).maybeSingle();
    if (error) throw new Error(error.message);
    if (!profile) return null;

    const active = await getActiveProject(supabase, userId);
    const { data: projects } = await supabase
      .from("projects")
      .select("id, name, niche_keywords, subscriber_count, channel_title, is_default, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: true });

    // Overlay active project fields so existing UI keeps working
    return {
      ...profile,
      ...(active
        ? {
            channel_id: active.channel_id,
            channel_url: active.channel_url,
            channel_title: active.channel_title,
            subscriber_count: active.subscriber_count,
            niche_keywords: active.niche_keywords,
            goal: active.goal,
          }
        : {}),
      active_project: active,
      projects: projects ?? [],
    };
  });

export const updateSubscriberCount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ subscriber_count: z.number().int().min(0).max(100_000_000) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const active = await getActiveProject(supabase, userId);
    if (!active) throw new Error("No active project");
    const { error } = await supabase
      .from("projects")
      .update({ subscriber_count: data.subscriber_count })
      .eq("id", active.id)
      .eq("user_id", userId);
    if (error) throw new Error(error.message);
    return { ok: true, subscriber_count: data.subscriber_count };
  });
