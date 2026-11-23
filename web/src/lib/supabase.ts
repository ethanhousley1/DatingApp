"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

let client: SupabaseClient | null = null;

// One shared browser client. All access rules are enforced by the database
// (row level security), so the app can talk to Supabase directly.
export function supabase(): SupabaseClient {
  if (!client) {
    client = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    );
  }
  return client;
}

// Turns a Supabase error into a message people can read.
export function errorText(error: unknown): string {
  if (!error) return "";
  if (typeof error === "object" && error && "message" in error) {
    return String((error as { message: string }).message);
  }
  return "Something went wrong. Try again.";
}
