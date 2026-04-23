import { NextResponse } from "next/server";
import { getPublicUrl } from "@/utils/request-url";
import {
  sanitizeNextPath,
  toOwnerLoginErrorCode,
  type OwnerAccessFailureReason,
} from "@/utils/owner-access";
import { createClient } from "@/utils/supabase/server";

function parseFailureReason(value: string | null): OwnerAccessFailureReason {
  switch (value) {
    case "email_not_allowed":
    case "profile_missing":
    case "profile_role_invalid":
    case "profile_lookup_failed":
      return value;
    default:
      return "profile_role_invalid";
  }
}

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const reason = parseFailureReason(requestUrl.searchParams.get("reason"));
  const next = sanitizeNextPath(requestUrl.searchParams.get("next"));
  const supabase = await createClient();
  const loginUrl = new URL(getPublicUrl(request, "/login"));

  await supabase.auth.signOut();

  loginUrl.searchParams.set("error", toOwnerLoginErrorCode(reason));
  loginUrl.searchParams.set("next", next);

  return NextResponse.redirect(loginUrl, 303);
}
