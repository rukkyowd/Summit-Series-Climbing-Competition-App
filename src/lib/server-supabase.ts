import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { SUPABASE_ENV_ERROR, SUPABASE_BROWSER_KEY_ERROR } from "./supabase";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseBrowserKey =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabaseServiceRoleKey = process.env["SUPABASE_SERVICE_ROLE_KEY"];

export const SUPABASE_SERVICE_ROLE_ERROR =
  "Missing Supabase service role credentials. Set SUPABASE_SERVICE_ROLE_KEY alongside NEXT_PUBLIC_SUPABASE_URL.";

export function assertSupabaseRouteClientConfigured() {
  if (!supabaseUrl || !supabaseBrowserKey) {
    throw new Error(SUPABASE_ENV_ERROR);
  }

  if (supabaseBrowserKey.startsWith("sb_secret_")) {
    throw new Error(SUPABASE_BROWSER_KEY_ERROR);
  }
}

export function assertSupabaseServiceRoleConfigured() {
  if (!supabaseUrl || !supabaseServiceRoleKey) {
    throw new Error(SUPABASE_SERVICE_ROLE_ERROR);
  }
}

export function createRouteSupabaseClient() {
  assertSupabaseRouteClientConfigured();
  const cookieStore = cookies();

  return createServerClient(supabaseUrl!, supabaseBrowserKey!, {
    cookies: {
      get(name: string) {
        return cookieStore.get(name)?.value;
      },
      set(name: string, value: string, options: Record<string, unknown>) {
        cookieStore.set({ name, value, ...options });
      },
      remove(name: string, options: Record<string, unknown>) {
        cookieStore.set({ name, value: "", ...options });
      },
    },
  });
}

export function createServiceRoleSupabaseClient() {
  assertSupabaseServiceRoleConfigured();

  return createClient(supabaseUrl!, supabaseServiceRoleKey!, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}
