import { resolveBatchDateRange } from "./lib/date-range.mjs";
import { getAccessToken } from "./lib/google-auth.mjs";
import { listGscSites, pickSite, queryGscByDate } from "./lib/gsc-client.mjs";

async function main() {
  const token = await getAccessToken("Search Console scopes");
  const siteEntries = await listGscSites(token);

  if (siteEntries.length === 0) {
    throw new Error("No Search Console properties were returned for the authenticated user.");
  }

  const siteUrl = pickSite(siteEntries);

  console.log("GSC sites.list result");
  console.log(JSON.stringify({
    count: siteEntries.length,
    chosenSite: siteUrl,
    sites: siteEntries.map((entry) => ({
      siteUrl: entry.siteUrl,
      permissionLevel: entry.permissionLevel,
    })),
  }, null, 2));

  if (!siteUrl) {
    throw new Error("No siteUrl was selected. Set GSC_SITE_URL to the target property.");
  }

  const { startDate, endDate } = resolveBatchDateRange({
    defaultDelayDays: 3,
    defaultWindowDays: 7,
  });
  const queryResponse = await queryGscByDate({
    token,
    siteUrl,
    startDate,
    endDate,
    rowLimit: 7,
  });

  console.log("GSC searchAnalytics.query result");
  console.log(JSON.stringify({
    siteUrl,
    startDate,
    endDate,
    rowCount: queryResponse.rows?.length || 0,
    rows: queryResponse.rows || [],
  }, null, 2));
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
