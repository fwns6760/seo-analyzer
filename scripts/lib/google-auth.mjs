import { execFileSync } from "node:child_process";

async function exchangeRefreshToken() {
  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
  const refreshToken = process.env.GOOGLE_OAUTH_REFRESH_TOKEN;

  if (!clientId || !clientSecret || !refreshToken) {
    return null;
  }

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`refresh token exchange failed: ${response.status} ${text}`);
  }

  const payload = await response.json();
  if (!payload.access_token) {
    throw new Error("refresh token exchange did not include access_token");
  }

  return payload.access_token;
}

async function getMetadataServerToken() {
  const response = await fetch(
    "http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token",
    {
      signal: AbortSignal.timeout(1500),
      headers: {
        "Metadata-Flavor": "Google",
      },
    },
  );

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`metadata server token request failed: ${response.status} ${text}`);
  }

  const payload = await response.json();
  if (!payload.access_token) {
    throw new Error("metadata server token response did not include access_token");
  }

  return payload.access_token;
}

export async function getAccessToken(requiredScopeHint) {
  const refreshed = await exchangeRefreshToken();
  if (refreshed) {
    return refreshed;
  }

  try {
    return await getMetadataServerToken();
  } catch {
    // Fallback to local gcloud-based auth for development.
  }

  const commands = [
    ["auth", "application-default", "print-access-token"],
    ["auth", "print-access-token"],
  ];

  for (const args of commands) {
    try {
      return execFileSync("gcloud", args, {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      }).trim();
    } catch {
      // Try the next credential source.
    }
  }

  throw new Error(
    `No usable access token was found. Run gcloud auth application-default login with ${requiredScopeHint}.`,
  );
}
