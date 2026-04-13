import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { Bindings } from "../types/env";

let supabaseInstance: SupabaseClient | null = null;

export const getSupabase = (env?: Bindings): SupabaseClient => {
  const url = env?.SUPABASE_URL || process.env.SUPABASE_URL;
  const key =
    env?.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error(
      "Missing Supabase environment variables: SUPABASE_URL and/or SUPABASE_SERVICE_ROLE_KEY",
    );
  }

  // Create a new client or return existing one
  // Note: For Cloudflare Workers, we might want to create it per request to be safe,
  // but usually it's fine to cache if the env doesn't change.
  return createClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
};

// For backward compatibility during refactor
export const supabase = getSupabase();
