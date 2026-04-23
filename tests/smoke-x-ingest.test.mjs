import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import path from "node:path";
import test from "node:test";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

test("x-ingest CLI renders JSON summary from the sample fixture", async () => {
  const fixturePath = path.resolve("tests", "fixtures", "x-manual-export-sample.csv");
  const { stdout } = await execFileAsync("node", [
    "scripts/x-ingest.mjs",
    "--fixture",
    fixturePath,
    "--format",
    "json",
    "--ingested-at",
    "2026-04-23T00:00:00.000Z",
  ]);

  const summary = JSON.parse(stdout);
  assert.equal(summary.window.post_count, 4);
  assert.equal(summary.coverage.matched_posts, 3);
  assert.equal(summary.coverage.unmatched_posts, 1);
  assert.equal(summary.window.ingested_at, "2026-04-23T00:00:00.000Z");
  assert.ok(Array.isArray(summary.top_posts));
  assert.ok(Array.isArray(summary.link_click_winners));
  assert.ok(Array.isArray(summary.post_to_page_matches));
  assert.ok(Array.isArray(summary.unmatched));
});

test("x-ingest CLI renders human summary", async () => {
  const fixturePath = path.resolve("tests", "fixtures", "x-manual-export-sample.csv");
  const { stdout } = await execFileAsync("node", [
    "scripts/x-ingest.mjs",
    "--fixture",
    fixturePath,
    "--format",
    "human",
  ]);

  assert.match(stdout, /^X Manual Ingest Summary/m);
  assert.match(stdout, /Coverage: matched/);
  assert.match(stdout, /Top posts/);
  assert.match(stdout, /Link click winners/);
});

test("x-ingest CLI fails when required columns are missing", async () => {
  const fixturePath = path.resolve("tests", "fixtures", "x-manual-export-missing.csv");

  await assert.rejects(
    execFileAsync("node", ["scripts/x-ingest.mjs", "--fixture", fixturePath, "--format", "json"]),
    (error) => {
      assert.equal(error.code, 1);
      assert.match(error.stderr, /Missing required CSV column/);
      return true;
    },
  );
});
