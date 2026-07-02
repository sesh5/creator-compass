import type { Session } from "@supabase/supabase-js";
import { supabase } from "./client";

/**
 * Returns the current session, but first waits for Supabase to finish
 * consuming an OAuth token hash when we've just been redirected back from
 * the provider (e.g. Google via the Lovable broker).
 *
 * `detectSessionInUrl` processes `#access_token=...` asynchronously during
 * client init. Route guards that call `getSession()` synchronously can race
 * that and briefly render the wrong page (the landing flash) before
 * `onAuthStateChange` fires and re-routes. Awaiting the settle removes it.
 */
export async function getSettledSession(): Promise<Session | null> {
  if (typeof window === "undefined") return null;

  const hasOAuthReturn = /[#&](access_token|error_description|error)=/.test(
    window.location.hash,
  );

  if (hasOAuthReturn) {
    await new Promise<void>((resolve) => {
      const { data } = supabase.auth.onAuthStateChange(() => {
        data.subscription.unsubscribe();
        resolve();
      });
      // Fail open — never hang a route guard if the event never arrives.
      setTimeout(() => {
        data.subscription.unsubscribe();
        resolve();
      }, 2000);
    });
  }

  const { data } = await supabase.auth.getSession();
  return data.session;
}
