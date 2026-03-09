import { NextResponse } from "next/server";
import { getPublicUrl } from "@/utils/request-url";
import { createClient } from "@/utils/supabase/server";

export async function POST(request: Request) {
  const formData = await request.formData();
  const rawNext = formData.get("next");
  const next = typeof rawNext === "string" && rawNext.startsWith("/") ? rawNext : "/";
  const redirectTo = getPublicUrl(request, `/auth/callback?next=${encodeURIComponent(next)}`);
  const supabase = await createClient();

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo,
    },
  });

  if (error || !data.url) {
    console.error("supabase.auth.signInWithOAuth failed", {
      message: error?.message,
      next,
      redirectTo,
    });
    return NextResponse.redirect(getPublicUrl(request, "/login?error=oauth_start_failed"), 303);
  }

  console.log("supabase.auth.signInWithOAuth success", {
    next,
    redirectTo,
    authUrlHost: new URL(data.url).host,
  });
  return NextResponse.redirect(data.url, 303);
}
