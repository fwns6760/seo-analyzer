import { NextResponse } from "next/server";
import { getOwnerAccessState, getUnauthorizedRedirectPath, sanitizeNextPath } from "@/utils/owner-access";
import { getPublicUrl } from "@/utils/request-url";
import { createClient } from "@/utils/supabase/server";

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const next = sanitizeNextPath(requestUrl.searchParams.get("next"));

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error) {
      const ownerAccess = await getOwnerAccessState(supabase);

      if (!ownerAccess.user) {
        console.error("auth callback missing user after session exchange", {
          next,
          hasCode: true,
        });
        return NextResponse.redirect(getPublicUrl(request, "/auth/auth-code-error"));
      }

      if (!ownerAccess.isOwner && ownerAccess.failureReason) {
        console.warn("auth callback blocked unauthorized user", {
          email: ownerAccess.user.email,
          reason: ownerAccess.failureReason,
          next,
        });
        return NextResponse.redirect(
          getPublicUrl(request, getUnauthorizedRedirectPath(ownerAccess.failureReason, next)),
          303,
        );
      }

      console.log("supabase.auth.exchangeCodeForSession success", {
        next,
        hasCode: true,
        email: ownerAccess.user.email,
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
