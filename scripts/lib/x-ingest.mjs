import fs from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const runtimeDefaults = require("../../config/runtime-defaults.json");

export const REQUIRED_COLUMNS = [
  "post_id",
  "post_url",
  "posted_at",
  "impressions",
  "engagements",
  "link_clicks",
];

export const OPTIONAL_COLUMNS = ["canonical_url", "slug"];

const HEADER_ALIASES = {
  post_id: ["post_id", "post id", "postid", "tweet_id", "tweet id", "id"],
  post_url: ["post_url", "post url", "permalink", "tweet_url", "tweet url", "url"],
  posted_at: ["posted_at", "posted at", "date", "time", "post time", "tweet time"],
  impressions: ["impressions", "impression"],
  engagements: ["engagements", "engagement"],
  link_clicks: ["link_clicks", "link clicks", "url_clicks", "url clicks"],
  canonical_url: ["canonical_url", "canonical url", "canonical"],
  slug: ["slug"],
};

const topListLimit = 5;

function normalizeHeader(header) {
  return String(header ?? "")
    .replace(/^﻿/, "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function buildHeaderMap(headers) {
  const canonicalByIndex = new Array(headers.length).fill(null);
  const seen = new Set();

  for (let index = 0; index < headers.length; index += 1) {
    const normalized = normalizeHeader(headers[index]);

    for (const [canonical, aliases] of Object.entries(HEADER_ALIASES)) {
      if (seen.has(canonical)) {
        continue;
      }

      if (aliases.includes(normalized)) {
        canonicalByIndex[index] = canonical;
        seen.add(canonical);
        break;
      }
    }
  }

  return canonicalByIndex;
}

export function parseCsv(text) {
  const cleaned = String(text ?? "").replace(/^﻿/, "");
  const rows = [];
  let current = [];
  let field = "";
  let inQuotes = false;

  for (let index = 0; index < cleaned.length; index += 1) {
    const ch = cleaned[index];

    if (inQuotes) {
      if (ch === '"') {
        if (cleaned[index + 1] === '"') {
          field += '"';
          index += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
      continue;
    }

    if (ch === '"') {
      inQuotes = true;
      continue;
    }

    if (ch === ",") {
      current.push(field);
      field = "";
      continue;
    }

    if (ch === "\r") {
      if (cleaned[index + 1] === "\n") {
        index += 1;
      }
      current.push(field);
      rows.push(current);
      current = [];
      field = "";
      continue;
    }

    if (ch === "\n") {
      current.push(field);
      rows.push(current);
      current = [];
      field = "";
      continue;
    }

    field += ch;
  }

  if (field.length > 0 || current.length > 0) {
    current.push(field);
    rows.push(current);
  }

  return rows.filter((row) => !(row.length === 1 && row[0] === ""));
}

function parseInteger(value) {
  if (value === null || value === undefined) {
    return null;
  }

  const stringValue = String(value).replace(/[,"]/g, "").trim();
  if (stringValue === "") {
    return null;
  }

  const number = Number(stringValue);
  return Number.isFinite(number) ? Math.trunc(number) : null;
}

function pathFromCanonicalUrl(url) {
  if (typeof url !== "string" || url.length === 0) {
    return null;
  }

  try {
    const parsed = new URL(url);
    const stripped = parsed.pathname.replace(/\/+$/, "");
    return stripped.length > 0 ? stripped : "/";
  } catch {
    return null;
  }
}

function resolveMatchedPagePath(row) {
  if (row.canonical_url) {
    const fromCanonical = pathFromCanonicalUrl(row.canonical_url);
    if (fromCanonical) {
      return fromCanonical;
    }
  }

  if (row.slug) {
    const normalized = row.slug.trim();
    if (normalized.length === 0) {
      return null;
    }
    return normalized.startsWith("/") ? normalized : `/${normalized}`;
  }

  return null;
}

export function parseRows(csvText) {
  const rows = parseCsv(csvText);
  if (rows.length === 0) {
    throw new Error("CSV is empty.");
  }

  const [headerRow, ...dataRows] = rows;
  const headerMap = buildHeaderMap(headerRow);
  const presentColumns = new Set(headerMap.filter(Boolean));

  const missingRequired = REQUIRED_COLUMNS.filter((name) => !presentColumns.has(name));
  if (missingRequired.length > 0) {
    throw new Error(
      `Missing required CSV column(s): ${missingRequired.join(", ")}. ` +
        `Required columns are: ${REQUIRED_COLUMNS.join(", ")}.`,
    );
  }

  return dataRows.map((fields) => {
    const record = {};
    for (let index = 0; index < fields.length; index += 1) {
      const canonical = headerMap[index];
      if (!canonical) {
        continue;
      }
      record[canonical] = fields[index] ?? "";
    }

    const canonicalUrl = String(record.canonical_url ?? "").trim();
    const slug = String(record.slug ?? "").trim();

    return {
      post_id: String(record.post_id ?? "").trim(),
      post_url: String(record.post_url ?? "").trim(),
      posted_at: String(record.posted_at ?? "").trim(),
      impressions: parseInteger(record.impressions) ?? 0,
      engagements: parseInteger(record.engagements) ?? 0,
      link_clicks: parseInteger(record.link_clicks) ?? 0,
      canonical_url: canonicalUrl.length > 0 ? canonicalUrl : null,
      slug: slug.length > 0 ? slug : null,
    };
  });
}

function toIsoDate(value) {
  if (!value) {
    return null;
  }

  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) {
    return null;
  }

  return date.toISOString().slice(0, 10);
}

function enrichRow(row) {
  return {
    ...row,
    matched_page_path: resolveMatchedPagePath(row),
  };
}

function sumBy(items, key) {
  return items.reduce((total, item) => total + (Number(item[key]) || 0), 0);
}

export function buildXIngestSummary(rows, { ingestedAt } = {}) {
  const enriched = rows.map(enrichRow);
  const matched = enriched.filter((row) => row.matched_page_path);
  const unmatched = enriched.filter((row) => !row.matched_page_path);

  const postedDates = enriched
    .map((row) => toIsoDate(row.posted_at))
    .filter(Boolean)
    .sort();
  const postedMin = postedDates[0] ?? null;
  const postedMax = postedDates[postedDates.length - 1] ?? null;

  const byEngagements = [...enriched].sort(
    (a, b) => b.engagements - a.engagements || b.impressions - a.impressions,
  );
  const byLinkClicks = [...enriched].sort(
    (a, b) => b.link_clicks - a.link_clicks || b.engagements - a.engagements,
  );

  const topPosts = byEngagements.slice(0, topListLimit);
  const linkClickWinners = byLinkClicks.filter((row) => row.link_clicks > 0).slice(0, topListLimit);

  const pageBuckets = new Map();
  for (const row of matched) {
    const key = row.matched_page_path;
    if (!pageBuckets.has(key)) {
      const origin = runtimeDefaults.site.canonicalOrigin;
      pageBuckets.set(key, {
        matched_page_path: key,
        canonical_url: row.canonical_url || (key.startsWith("/") ? `${origin}${key}` : null),
        post_count: 0,
        impressions: 0,
        engagements: 0,
        link_clicks: 0,
      });
    }
    const bucket = pageBuckets.get(key);
    bucket.post_count += 1;
    bucket.impressions += row.impressions;
    bucket.engagements += row.engagements;
    bucket.link_clicks += row.link_clicks;
  }

  const postToPageMatches = [...pageBuckets.values()].sort(
    (a, b) => b.link_clicks - a.link_clicks || b.engagements - a.engagements,
  );

  const totalImpressions = sumBy(enriched, "impressions");
  const totalEngagements = sumBy(enriched, "engagements");
  const totalLinkClicks = sumBy(enriched, "link_clicks");

  const avgEngagementRate =
    totalImpressions > 0 ? Number((totalEngagements / totalImpressions).toFixed(4)) : null;

  const coverage = {
    total_posts: enriched.length,
    matched_posts: matched.length,
    unmatched_posts: unmatched.length,
    matched_rate:
      enriched.length > 0 ? Number((matched.length / enriched.length).toFixed(4)) : null,
  };

  const topPost = topPosts[0] ?? null;
  const topLinkPost = linkClickWinners[0] ?? null;

  return {
    window: {
      posted_min: postedMin,
      posted_max: postedMax,
      post_count: enriched.length,
      ingested_at: ingestedAt ?? null,
    },
    top_posts: topPosts,
    link_click_winners: linkClickWinners,
    post_to_page_matches: postToPageMatches,
    coverage,
    social_x_summary: {
      total_impressions: totalImpressions,
      total_engagements: totalEngagements,
      total_link_clicks: totalLinkClicks,
      avg_engagement_rate: avgEngagementRate,
      top_post_id: topPost ? topPost.post_id : null,
      top_link_click_post_id: topLinkPost ? topLinkPost.post_id : null,
    },
    unmatched,
  };
}

export async function loadCsvFile(filePath) {
  const absolutePath = path.resolve(filePath);
  return fs.readFile(absolutePath, "utf8");
}

export async function ingestXManualCsv(filePath, options = {}) {
  const text = await loadCsvFile(filePath);
  const rows = parseRows(text);
  return buildXIngestSummary(rows, options);
}

function formatRate(value) {
  if (value === null || value === undefined) {
    return "-";
  }
  return `${Math.round(value * 100)}%`;
}

export function renderXIngestHuman(summary) {
  const lines = [
    "X Manual Ingest Summary",
    `- 期間: ${summary.window.posted_min ?? "-"} 〜 ${summary.window.posted_max ?? "-"}`,
    `- 投稿数: ${summary.window.post_count}`,
    `- Coverage: matched ${summary.coverage.matched_posts}/${summary.coverage.total_posts} (${formatRate(summary.coverage.matched_rate)})`,
    `- 合計 impressions: ${summary.social_x_summary.total_impressions}`,
    `- 合計 engagements: ${summary.social_x_summary.total_engagements}`,
    `- 合計 link_clicks: ${summary.social_x_summary.total_link_clicks}`,
    `- 平均 engagement rate: ${formatRate(summary.social_x_summary.avg_engagement_rate)}`,
    "",
    "Top posts (by engagements)",
  ];

  if (summary.top_posts.length === 0) {
    lines.push("- なし");
  } else {
    summary.top_posts.forEach((post) => {
      lines.push(
        `- ${post.post_id} | eng ${post.engagements} / imp ${post.impressions} / link ${post.link_clicks} / ${
          post.matched_page_path ?? "unmatched"
        }`,
      );
    });
  }

  lines.push("", "Link click winners");
  if (summary.link_click_winners.length === 0) {
    lines.push("- なし");
  } else {
    summary.link_click_winners.forEach((post) => {
      lines.push(
        `- ${post.post_id} | link ${post.link_clicks} / ${post.matched_page_path ?? "unmatched"}`,
      );
    });
  }

  lines.push("", "Post → page matches");
  if (summary.post_to_page_matches.length === 0) {
    lines.push("- なし");
  } else {
    summary.post_to_page_matches.forEach((entry) => {
      lines.push(
        `- ${entry.matched_page_path} | posts ${entry.post_count} / link ${entry.link_clicks} / eng ${entry.engagements}`,
      );
    });
  }

  lines.push("", "Unmatched");
  if (summary.unmatched.length === 0) {
    lines.push("- なし");
  } else {
    lines.push(`- ${summary.unmatched.length} 件（canonical_url / slug が無い or 解決不能）`);
  }

  return lines.join("\n");
}
