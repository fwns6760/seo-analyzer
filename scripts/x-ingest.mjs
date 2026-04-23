import {
  ingestXManualCsv,
  renderXIngestHuman,
} from "./lib/x-ingest.mjs";

function parseArgs(argv) {
  const args = {
    csv: null,
    format: "human",
    ingestedAt: null,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];

    if (token === "--csv" || token === "--fixture") {
      args.csv = argv[index + 1] ?? null;
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
      continue;
    }

    if (token === "--ingested-at") {
      args.ingestedAt = argv[index + 1] ?? null;
      index += 1;
      continue;
    }
  }

  if (!args.csv) {
    throw new Error("CSV path is required. Use --csv <path> or --fixture <path>.");
  }

  if (!["human", "json"].includes(args.format)) {
    throw new Error(`Unsupported format: ${args.format}`);
  }

  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const summary = await ingestXManualCsv(args.csv, {
    ingestedAt: args.ingestedAt ?? new Date().toISOString(),
  });

  if (args.format === "json") {
    console.log(JSON.stringify(summary, null, 2));
    return;
  }

  console.log(renderXIngestHuman(summary));
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
