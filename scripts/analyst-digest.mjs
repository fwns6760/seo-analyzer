import { getAccessToken } from "./lib/google-auth.mjs";
import {
  buildAnalystDigest,
  fetchAnalystSnapshot,
  getBigQueryToken,
  loadFixtureSnapshot,
  renderAnalystHumanDigest,
} from "./lib/analyst-digest.mjs";
import { getBigQueryRuntimeConfig } from "./lib/runtime-config.mjs";

function parseArgs(argv) {
  const args = {
    fixture: null,
    format: "human",
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];

    if (token === "--fixture") {
      args.fixture = argv[index + 1] ?? null;
      index += 1;
      continue;
    }

    if (token === "--format") {
      args.format = argv[index + 1] ?? "human";
      index += 1;
      continue;
    }

    if (token === "--json") {
      args.format = "json";
    }
  }

  if (!["human", "json"].includes(args.format)) {
    throw new Error(`Unsupported format: ${args.format}`);
  }

  return args;
}

async function resolveSnapshot(args) {
  if (args.fixture) {
    return loadFixtureSnapshot(args.fixture);
  }

  const config = getBigQueryRuntimeConfig();
  const token = await getBigQueryToken(getAccessToken);
  return fetchAnalystSnapshot({
    config,
    token,
  });
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const snapshot = await resolveSnapshot(args);
  const digest = buildAnalystDigest(snapshot);

  if (args.format === "json") {
    console.log(JSON.stringify(digest, null, 2));
    return;
  }

  console.log(renderAnalystHumanDigest(digest));
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
