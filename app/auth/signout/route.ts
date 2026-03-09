import { NextResponse } from "next/server";
import { getPublicUrl } from "@/utils/request-url";
import { createClient } from "@/utils/supabase/server";

export async function POST(request: Request) {
  const supabase = await createClient();
  await supabase.auth.signOut();

  return NextResponse.redirect(getPublicUrl(request, "/login"), 303);
}
