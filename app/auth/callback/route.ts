import { NextResponse } from "next/server";
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
      const forwardedHost = request.headers.get("x-forwarded-host");
      const isLocalEnv = process.env.NODE_ENV === "development";

      if (isLocalEnv) {
        return NextResponse.redirect(`${requestUrl.origin}${next}`);
      }

      if (forwardedHost) {
        return NextResponse.redirect(`https://${forwardedHost}${next}`);
      }

      return NextResponse.redirect(`${requestUrl.origin}${next}`);
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

  return NextResponse.redirect(`${requestUrl.origin}/auth/auth-code-error`);
}
