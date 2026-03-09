import "server-only";

import { execFileSync } from "node:child_process";

type MetadataTokenPayload = {
  access_token?: string;
};

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

  const payload = (await response.json()) as MetadataTokenPayload;
  if (!payload.access_token) {
    throw new Error("metadata server token response did not include access_token");
  }

  return payload.access_token;
}

function getLocalGcloudToken() {
  const commands = [
    ["auth", "application-default", "print-access-token"],
    ["auth", "print-access-token"],
  ] as const;

  for (const args of commands) {
    try {
      return execFileSync("gcloud", [...args], {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      }).trim();
    } catch {
      // Try the next local credential source.
    }
  }

  return null;
}

export async function getGoogleAccessToken(requiredScopeHint: string) {
  try {
    return await getMetadataServerToken();
  } catch {
    // Cloud Run first, local development second.
  }

  const localToken = getLocalGcloudToken();
  if (localToken) {
    return localToken;
  }

  throw new Error(
    `No usable Google access token was found. Run gcloud auth application-default login with ${requiredScopeHint}.`,
  );
}
