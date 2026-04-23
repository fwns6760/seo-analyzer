import { createClient } from "@/utils/supabase/server";
import { ownerConfig } from "@/utils/runtime-config";

const ownerEmails = ownerConfig.emails;
const ownerEmailSet = new Set<string>(ownerEmails);
export const primaryOwnerEmail = ownerEmails[0];

export const ownerLoginErrorMessages = {
  owner_email_not_allowed: "許可された owner メールだけがログインできます。",
  owner_role_required: "profiles.role = owner のアカウントだけが管理画面に入れます。",
  owner_profile_missing: "profiles がまだ作成されていません。profiles を確認してください。",
  owner_profile_lookup_failed: "profiles の確認に失敗しました。時間を置いて再ログインしてください。",
  oauth_start_failed: "Google OAuth の開始に失敗しました。設定を確認してください。",
} as const;

export type OwnerLoginErrorCode = keyof typeof ownerLoginErrorMessages;

export type OwnerAccessFailureReason =
  | "email_not_allowed"
  | "profile_missing"
  | "profile_role_invalid"
  | "profile_lookup_failed";

export type OwnerProfile = {
  id: string;
  email: string | null;
  full_name: string | null;
  avatar_url: string | null;
  role: "owner" | "viewer" | null;
};

type ServerSupabaseClient = Awaited<ReturnType<typeof createClient>>;

export function sanitizeNextPath(value: string | null | undefined) {
  return value && value.startsWith("/") ? value : "/";
}

function normalizeEmail(value: string | null | undefined) {
  return value?.trim().toLowerCase() ?? null;
}

export function isAllowedOwnerEmail(value: string | null | undefined) {
  const normalizedEmail = normalizeEmail(value);
  return normalizedEmail ? ownerEmailSet.has(normalizedEmail) : false;
}

export function toOwnerLoginErrorCode(reason: OwnerAccessFailureReason): OwnerLoginErrorCode {
  switch (reason) {
    case "email_not_allowed":
      return "owner_email_not_allowed";
    case "profile_missing":
      return "owner_profile_missing";
    case "profile_lookup_failed":
      return "owner_profile_lookup_failed";
    case "profile_role_invalid":
    default:
      return "owner_role_required";
  }
}

export function getUnauthorizedRedirectPath(
  reason: OwnerAccessFailureReason,
  next?: string | null,
) {
  const searchParams = new URLSearchParams({
    reason,
    next: sanitizeNextPath(next),
  });

  return `/auth/unauthorized?${searchParams.toString()}`;
}

export async function getOwnerAccessState(existingClient?: ServerSupabaseClient) {
  const supabase = existingClient ?? (await createClient());
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return {
      supabase,
      user: null,
      profile: null,
      isOwner: false,
      failureReason: null,
    } as const;
  }

  const profileResult = await supabase
    .from("profiles")
    .select("id, email, full_name, avatar_url, role")
    .eq("id", user.id)
    .maybeSingle();

  if (profileResult.error) {
    return {
      supabase,
      user,
      profile: null,
      isOwner: false,
      failureReason: "profile_lookup_failed",
    } as const;
  }

  const profile = (profileResult.data ?? null) as OwnerProfile | null;

  if (!profile) {
    return {
      supabase,
      user,
      profile: null,
      isOwner: false,
      failureReason: "profile_missing",
    } as const;
  }

  if (!isAllowedOwnerEmail(user.email)) {
    return {
      supabase,
      user,
      profile,
      isOwner: false,
      failureReason: "email_not_allowed",
    } as const;
  }

  if (profile.role !== "owner") {
    return {
      supabase,
      user,
      profile,
      isOwner: false,
      failureReason: "profile_role_invalid",
    } as const;
  }

  return {
    supabase,
    user,
    profile,
    isOwner: true,
    failureReason: null,
  } as const;
}
