import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import test from "node:test";

import {
  buildAnalystDigest,
  renderAnalystHumanDigest,
} from "../scripts/lib/analyst-digest.mjs";

async function loadFixture(name) {
  const fixturePath = path.resolve("tests", "fixtures", name);
  const payload = await fs.readFile(fixturePath, "utf8");
  return JSON.parse(payload);
}

test("buildAnalystDigest returns ready sections from snapshot data", async () => {
  const snapshot = await loadFixture("analyst-digest-ready.json");
  const digest = buildAnalystDigest(snapshot);

  assert.equal(digest.window.status, "ready");
  assert.equal(digest.window.comparison_ready, true);
  assert.equal(digest.kpis.clicks.current, 128);
  assert.equal(digest.kpis.clicks.previous, 92);
  assert.equal(digest.winners.length, 1);
  assert.equal(digest.losers.length, 1);
  assert.equal(digest.query_moves.length, 1);
  assert.equal(digest.opportunities.length, 2);
  assert.equal(digest.next_action_candidates.length, 1);
  assert.equal(digest.next_action_candidates[0].kind, "defence");
  assert.equal(digest.revenue, null);
  assert.equal(digest.social_x, null);
});

test("buildAnalystDigest reports collecting when comparison window is not ready", async () => {
  const snapshot = await loadFixture("analyst-digest-collecting.json");
  const digest = buildAnalystDigest(snapshot);

  assert.equal(digest.window.status, "collecting");
  assert.equal(digest.window.comparison_ready, false);
  assert.equal(digest.winners.length, 0);
  assert.equal(digest.losers.length, 0);
  assert.equal(digest.query_moves.length, 0);
  assert.equal(digest.opportunities.length, 0);
  assert.equal(digest.next_action_candidates.length, 0);
  assert.match(digest.window.status_reason, /蓄積中/);
});

test("renderAnalystHumanDigest keeps the fixed five-block format", async () => {
  const snapshot = await loadFixture("analyst-digest-ready.json");
  const digest = buildAnalystDigest(snapshot);
  const rendered = renderAnalystHumanDigest(digest);

  assert.match(rendered, /^今日の要点/m);
  assert.match(rendered, /^伸びたページ/m);
  assert.match(rendered, /^落ちたページ/m);
  assert.match(rendered, /^流入クエリ\/改善候補/m);
  assert.match(rendered, /^次の一手/m);
  assert.match(rendered, /収益: 未接続 \/ X寄与: 未接続/);
});
