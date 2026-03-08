const targetDomain = "yoshilover.com";

export async function analyticsRequest(baseUrl, path, { method = "GET", body, token }) {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`${method} ${baseUrl}${path} failed: ${response.status} ${text}`);
  }

  return response.json();
}

export async function listAccountSummaries(token) {
  const response = await analyticsRequest(
    "https://analyticsadmin.googleapis.com",
    "/v1beta/accountSummaries?pageSize=200",
    { token },
  );

  return response.accountSummaries || [];
}

export async function listDataStreams(propertyName, token) {
  const response = await analyticsRequest(
    "https://analyticsadmin.googleapis.com",
    `/v1beta/${propertyName}/dataStreams?pageSize=200`,
    { token },
  );

  return response.dataStreams || [];
}

function normalizePropertyName(input) {
  if (!input) {
    return null;
  }

  return input.startsWith("properties/") ? input : `properties/${input}`;
}

export async function chooseProperty(accountSummaries, token) {
  const explicit = normalizePropertyName(process.env.GA4_PROPERTY_ID);
  const propertySummaries = accountSummaries.flatMap((accountSummary) =>
    (accountSummary.propertySummaries || []).map((propertySummary) => ({
      account: accountSummary.account,
      accountDisplayName: accountSummary.displayName,
      property: propertySummary.property,
      propertyDisplayName: propertySummary.displayName,
      propertyType: propertySummary.propertyType,
    })),
  );

  if (propertySummaries.length === 0) {
    throw new Error("No GA4 properties were returned by accountSummaries.list.");
  }

  if (explicit) {
    const match = propertySummaries.find((propertySummary) => propertySummary.property === explicit);
    if (!match) {
      throw new Error(
        `GA4_PROPERTY_ID ${explicit} was not returned by accountSummaries.list. Use one of: ${propertySummaries.map((item) => item.property).join(", ")}`,
      );
    }

    return { chosenProperty: match, inspectedStreams: [] };
  }

  const inspectedStreams = [];

  for (const propertySummary of propertySummaries) {
    const dataStreams = await listDataStreams(propertySummary.property, token);

    for (const dataStream of dataStreams) {
      const defaultUri = dataStream.webStreamData?.defaultUri || "";
      inspectedStreams.push({
        property: propertySummary.property,
        propertyDisplayName: propertySummary.propertyDisplayName,
        dataStream: dataStream.name,
        dataStreamDisplayName: dataStream.displayName,
        defaultUri,
        measurementId: dataStream.webStreamData?.measurementId || null,
      });

      if (defaultUri.includes(targetDomain)) {
        return { chosenProperty: propertySummary, inspectedStreams };
      }
    }
  }

  return { chosenProperty: propertySummaries[0], inspectedStreams };
}

export async function runGa4DateReport({
  propertyName,
  token,
  startDate,
  endDate,
  dimensions = ["date"],
  metrics = ["sessions", "totalUsers"],
  dimensionFilter = {
    filter: {
      fieldName: "sessionDefaultChannelGroup",
      stringFilter: {
        matchType: "EXACT",
        value: "Organic Search",
      },
    },
  },
  limit = 25000,
  offset = 0,
}) {
  return analyticsRequest(
    "https://analyticsdata.googleapis.com",
    `/v1beta/${propertyName}:runReport`,
    {
      method: "POST",
      token,
      body: {
        dateRanges: [{ startDate, endDate }],
        dimensions: dimensions.map((name) => ({ name })),
        metrics: metrics.map((name) => ({ name })),
        dimensionFilter,
        keepEmptyRows: true,
        limit: String(limit),
        offset: String(offset),
      },
    },
  );
}

export async function runAllGa4Rows({
  propertyName,
  token,
  startDate,
  endDate,
  dimensions,
  metrics,
  dimensionFilter,
  limit = 25000,
}) {
  const rows = [];
  let offset = 0;
  let metricHeaders = [];
  let dimensionHeaders = [];

  while (true) {
    const response = await runGa4DateReport({
      propertyName,
      token,
      startDate,
      endDate,
      dimensions,
      metrics,
      dimensionFilter,
      limit,
      offset,
    });

    const pageRows = response.rows || [];
    rows.push(...pageRows);
    metricHeaders = response.metricHeaders || metricHeaders;
    dimensionHeaders = response.dimensionHeaders || dimensionHeaders;

    if (pageRows.length < limit) {
      return {
        rows,
        rowCount: response.rowCount || rows.length,
        metricHeaders,
        dimensionHeaders,
      };
    }

    offset += limit;
  }
}
