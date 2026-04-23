import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import path from "node:path";
import test from "node:test";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

test("analyst digest CLI renders json from a fixture", async () => {
  const fixturePath = path.resolve("tests", "fixtures", "analyst-digest-ready.json");
  const { stdout } = await execFileAsync("node", [
    "scripts/analyst-digest.mjs",
    "--fixture",
    fixturePath,
    "--format",
    "json",
  ]);

  const digest = JSON.parse(stdout);
  assert.equal(digest.window.status, "ready");
  assert.equal(digest.winners[0].entity_label, "エース予告先発");
});

test("analyst digest CLI renders human output from a fixture", async () => {
  const fixturePath = path.resolve("tests", "fixtures", "analyst-digest-collecting.json");
  const { stdout } = await execFileAsync("node", [
    "scripts/analyst-digest.mjs",
    "--fixture",
    fixturePath,
    "--format",
    "human",
  ]);

  assert.match(stdout, /^今日の要点/m);
  assert.match(stdout, /蓄積中/);
  assert.match(stdout, /^次の一手/m);
});
