import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseBrowserKey =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export const SUPABASE_ENV_ERROR =
  "Missing Supabase browser credentials. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY (or legacy NEXT_PUBLIC_SUPABASE_ANON_KEY) in .env or .env.local.";

export const SUPABASE_BROWSER_KEY_ERROR =
  "Supabase browser client is using a secret key. Replace it with a publishable key (sb_publishable_...) or a legacy anon key. Never expose sb_secret_ keys in the browser.";

export const supabaseConfigured = Boolean(supabaseUrl && supabaseBrowserKey);
export const supabaseUsesSecretKey = Boolean(
  supabaseBrowserKey?.startsWith("sb_secret_")
);

export function assertSupabaseConfigured() {
  if (!supabaseConfigured) {
    throw new Error(SUPABASE_ENV_ERROR);
  }

  if (supabaseUsesSecretKey) {
    throw new Error(SUPABASE_BROWSER_KEY_ERROR);
  }
}

function createBrowserClient(persistSession: boolean) {
  return createClient(
    supabaseUrl ?? "https://placeholder-project.supabase.co",
    supabaseBrowserKey ?? "placeholder-browser-key",
    {
      auth: {
        persistSession,
        autoRefreshToken: persistSession,
        detectSessionInUrl: persistSession,
      },
      realtime: {
        params: {
          eventsPerSecond: 10,
        },
      },
    }
  );
}

export const supabase = createBrowserClient(true);

// Public screens should always read with the publishable key alone so stale staff
// sessions in local storage cannot break anonymous leaderboard queries.
export const publicSupabase = createBrowserClient(false);
