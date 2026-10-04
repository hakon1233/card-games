"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { redirectPath } from "@/lib/redirect-path";

export type AuthState = { error?: string } | undefined;

export async function signUp(state: AuthState, formData: FormData): Promise<AuthState> {
  const supabase = await createClient();
  const email = formData.get("email") as string;
  const password = formData.get("password") as string;
  const displayName = formData.get("displayName") as string;
  const next = redirectPath(formData.get("next"));

  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { name: displayName } },
  });
  if (error) return { error: error.message };
  redirect(next);
}

export async function signIn(state: AuthState, formData: FormData): Promise<AuthState> {
  const supabase = await createClient();
  const email = formData.get("email") as string;
  const password = formData.get("password") as string;
  const next = redirectPath(formData.get("next"));

  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { error: error.message };
  redirect(next);
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/");
}

export async function signInWithGoogle(next: string = "/") {
  const supabase = await createClient();
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: `${siteUrl}/auth/callback?next=${encodeURIComponent(redirectPath(next))}`,
    },
  });
  if (error) return { error: error.message };
  if (data.url) redirect(data.url);
}
