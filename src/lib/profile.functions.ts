import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const OnboardingInput = z.object({
  channel_url: z.string().trim().max(500).optional().nullable(),
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
    let subscriber_count = 0;
    let channel_url = data.channel_url?.trim() || null;

    if (channel_url) {
      try {
        const ch = await getChannelByHandleOrUrl(channel_url);
        if (ch) {
          channel_id = ch.id;
          channel_title = ch.title;
          subscriber_count = ch.subscriberCount;
        }
      } catch (e) {
        console.error("channel lookup failed", e);
      }
    }

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
      })
      .eq("id", userId);

    if (error) throw new Error(error.message);
    return { ok: true, channel_id, channel_title, subscriber_count };
  });

export const getMyProfile = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data, error } = await supabase.from("profiles").select("*").eq("id", userId).maybeSingle();
    if (error) throw new Error(error.message);
    return data;
  });
