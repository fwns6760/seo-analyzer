import { resolveBatchDateRange } from "./lib/date-range.mjs";
import { chooseProperty, listAccountSummaries, runGa4DateReport } from "./lib/ga4-client.mjs";
import { getAccessToken } from "./lib/google-auth.mjs";

async function main() {
  const token = await getAccessToken("analytics.readonly scope");
  const accountSummaries = await listAccountSummaries(token);
  const { chosenProperty, inspectedStreams } = await chooseProperty(accountSummaries, token);
  const { startDate, endDate } = resolveBatchDateRange({
    defaultDelayDays: 2,
    defaultWindowDays: 7,
  });
  const report = await runGa4DateReport({
    propertyName: chosenProperty.property,
    token,
    startDate,
    endDate,
    limit: 7,
  });

  console.log("GA4 accountSummaries.list result");
  console.log(JSON.stringify({
    accountCount: accountSummaries.length,
    properties: accountSummaries.flatMap((accountSummary) =>
      (accountSummary.propertySummaries || []).map((propertySummary) => ({
        account: accountSummary.account,
        accountDisplayName: accountSummary.displayName,
        property: propertySummary.property,
        propertyDisplayName: propertySummary.displayName,
        propertyType: propertySummary.propertyType,
      })),
    ),
    inspectedStreams,
    chosenProperty,
  }, null, 2));

  console.log("GA4 runReport result");
  console.log(JSON.stringify({
    property: chosenProperty.property,
    propertyDisplayName: chosenProperty.propertyDisplayName,
    startDate,
    endDate,
    dimensionHeaders: report.dimensionHeaders,
    metricHeaders: report.metricHeaders,
    rowCount: report.rowCount,
    rows: report.rows,
  }, null, 2));
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
