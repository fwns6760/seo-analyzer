import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import test from "node:test";

import {
  buildXIngestSummary,
  parseCsv,
  parseRows,
  REQUIRED_COLUMNS,
} from "../scripts/lib/x-ingest.mjs";

async function loadFixture(name) {
  const fixturePath = path.resolve("tests", "fixtures", name);
  return fs.readFile(fixturePath, "utf8");
}

test("parseCsv handles quoted fields, escaped quotes, and CRLF", () => {
  const text = 'a,b,c\r\n"x,1","he said ""hi""",3\r\n';
  const rows = parseCsv(text);
  assert.deepEqual(rows, [
    ["a", "b", "c"],
    ["x,1", 'he said "hi"', "3"],
  ]);
});

test("parseRows rejects CSV with missing required columns", async () => {
  const text = await loadFixture("x-manual-export-missing.csv");
  assert.throws(() => parseRows(text), /Missing required CSV column/);
});

test("parseRows normalizes required columns and handles integer commas", async () => {
  const text = await loadFixture("x-manual-export-sample.csv");
  const rows = parseRows(text);

  assert.equal(rows.length, 4);
  assert.equal(rows[0].post_id, "1890000000000000001");
  assert.equal(rows[0].impressions, 1200);
  assert.equal(rows[0].canonical_url, "https://yoshilover.com/hanshinsatokazoku");
  assert.equal(rows[0].slug, null);
  assert.equal(rows[1].canonical_url, null);
  assert.equal(rows[1].slug, "okamotochichihaha");
  assert.equal(rows[2].canonical_url, null);
  assert.equal(rows[2].slug, null);
});

test("parseRows accepts alias headers (case-insensitive)", () => {
  const text = [
    "Post Id,Permalink,Date,Impressions,Engagements,Link Clicks,Canonical URL,Slug",
    "abc,https://x.com/post/abc,2026-04-22,100,5,1,https://yoshilover.com/foo,",
  ].join("\n");

  const rows = parseRows(text);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].post_id, "abc");
  assert.equal(rows[0].post_url, "https://x.com/post/abc");
  assert.equal(rows[0].impressions, 100);
  assert.equal(rows[0].link_clicks, 1);
  assert.equal(rows[0].canonical_url, "https://yoshilover.com/foo");
});

test("REQUIRED_COLUMNS are exactly the 6 contract columns", () => {
  assert.deepEqual(REQUIRED_COLUMNS, [
    "post_id",
    "post_url",
    "posted_at",
    "impressions",
    "engagements",
    "link_clicks",
  ]);
});

test("buildXIngestSummary aggregates totals, matches, and coverage", async () => {
  const text = await loadFixture("x-manual-export-sample.csv");
  const rows = parseRows(text);
  const summary = buildXIngestSummary(rows, { ingestedAt: "2026-04-23T00:00:00.000Z" });

  assert.equal(summary.window.post_count, 4);
  assert.equal(summary.window.posted_min, "2026-04-19");
  assert.equal(summary.window.posted_max, "2026-04-22");

  assert.equal(summary.social_x_summary.total_impressions, 1200 + 600 + 300 + 800);
  assert.equal(summary.social_x_summary.total_engagements, 45 + 20 + 5 + 30);
  assert.equal(summary.social_x_summary.total_link_clicks, 12 + 3 + 0 + 8);

  assert.equal(summary.coverage.total_posts, 4);
  assert.equal(summary.coverage.matched_posts, 3);
  assert.equal(summary.coverage.unmatched_posts, 1);
  assert.equal(summary.coverage.matched_rate, 0.75);

  const matchByPath = new Map(
    summary.post_to_page_matches.map((entry) => [entry.matched_page_path, entry]),
  );
  assert.equal(matchByPath.get("/hanshinsatokazoku").post_count, 2);
  assert.equal(matchByPath.get("/hanshinsatokazoku").link_clicks, 20);
  assert.equal(matchByPath.get("/okamotochichihaha").post_count, 1);

  assert.equal(summary.unmatched.length, 1);
  assert.equal(summary.unmatched[0].post_id, "1890000000000000003");
});

test("buildXIngestSummary orders top_posts by engagements and link_click_winners by link_clicks", async () => {
  const text = await loadFixture("x-manual-export-sample.csv");
  const rows = parseRows(text);
  const summary = buildXIngestSummary(rows, { ingestedAt: "2026-04-23T00:00:00.000Z" });

  assert.equal(summary.top_posts[0].post_id, "1890000000000000001");
  assert.equal(summary.top_posts[0].engagements, 45);

  assert.equal(summary.link_click_winners[0].post_id, "1890000000000000001");
  assert.equal(summary.link_click_winners[0].link_clicks, 12);
  assert.equal(summary.link_click_winners.every((row) => row.link_clicks > 0), true);
});

test("buildXIngestSummary exposes matched_page_path on each post", async () => {
  const text = await loadFixture("x-manual-export-sample.csv");
  const rows = parseRows(text);
  const summary = buildXIngestSummary(rows, {});

  const matched = summary.top_posts.find((post) => post.post_id === "1890000000000000002");
  assert.equal(matched.matched_page_path, "/okamotochichihaha");

  const unmatched = summary.top_posts.find((post) => post.post_id === "1890000000000000003");
  assert.equal(unmatched.matched_page_path, null);
});
