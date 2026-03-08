const defaultSiteCandidates = [
  "sc-domain:yoshilover.com",
  "https://yoshilover.com/",
  "http://yoshilover.com/",
];

export async function gscRequest(path, { method = "GET", body, token }) {
  const response = await fetch(`https://searchconsole.googleapis.com/webmasters/v3/${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`${method} ${path} failed: ${response.status} ${text}`);
  }

  return response.json();
}

export function pickSite(siteEntries) {
  const explicit = process.env.GSC_SITE_URL;
  const siteUrls = siteEntries.map((entry) => entry.siteUrl);

  if (explicit) {
    if (!siteUrls.includes(explicit)) {
      throw new Error(
        `GSC_SITE_URL ${explicit} was not returned by sites.list. Use one of: ${siteUrls.join(", ")}`,
      );
    }
    return explicit;
  }

  for (const candidate of defaultSiteCandidates) {
    if (siteUrls.includes(candidate)) {
      return candidate;
    }
  }

  return siteUrls.find((siteUrl) => siteUrl.includes("yoshilover.com")) || siteUrls[0];
}

export async function listGscSites(token) {
  const sitesResponse = await gscRequest("sites", { token });
  return sitesResponse.siteEntry || [];
}

export async function queryGscByDate({
  token,
  siteUrl,
  startDate,
  endDate,
  dimensions = ["date"],
  rowLimit = 25000,
  startRow = 0,
  searchType = "web",
}) {
  const encodedSiteUrl = encodeURIComponent(siteUrl);
  return gscRequest(`sites/${encodedSiteUrl}/searchAnalytics/query`, {
    method: "POST",
    token,
    body: {
      startDate,
      endDate,
      dimensions,
      rowLimit,
      startRow,
      type: searchType,
    },
  });
}

export async function queryAllGscRows({
  token,
  siteUrl,
  startDate,
  endDate,
  dimensions,
  rowLimit = 25000,
  searchType = "web",
}) {
  const rows = [];
  let startRow = 0;

  while (true) {
    const response = await queryGscByDate({
      token,
      siteUrl,
      startDate,
      endDate,
      dimensions,
      rowLimit,
      startRow,
      searchType,
    });
    const pageRows = response.rows || [];
    rows.push(...pageRows);

    if (pageRows.length < rowLimit) {
      break;
    }

    startRow += rowLimit;
  }

  return rows;
}
