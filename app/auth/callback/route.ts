import { NextResponse } from "next/server";
import { getPublicUrl } from "@/utils/request-url";
import { createClient } from "@/utils/supabase/server";

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  let next = requestUrl.searchParams.get("next") ?? "/";

  if (!next.startsWith("/")) {
    next = "/";
  }

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error) {
      console.log("supabase.auth.exchangeCodeForSession success", {
        next,
        hasCode: true,
      });
      return NextResponse.redirect(getPublicUrl(request, next));
    }

    console.error("supabase.auth.exchangeCodeForSession failed", {
      message: error.message,
      next,
      hasCode: true,
    });
  }

  if (!code) {
    console.error("auth callback missing code", {
      next,
      url: requestUrl.toString(),
    });
  }

  return NextResponse.redirect(getPublicUrl(request, "/auth/auth-code-error"));
}
