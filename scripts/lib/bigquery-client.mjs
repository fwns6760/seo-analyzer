async function bigQueryRequest(path, { method = "GET", body, token }) {
  const response = await fetch(`https://bigquery.googleapis.com/bigquery/v2/${path}`, {
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

  if (response.status === 204) {
    return null;
  }

  return response.json();
}

export async function insertAllRows({
  projectId,
  datasetId,
  tableId,
  rows,
  token,
  chunkSize = 500,
}) {
  let insertedRowCount = 0;

  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize);
    const response = await bigQueryRequest(
      `projects/${projectId}/datasets/${datasetId}/tables/${tableId}/insertAll`,
      {
        method: "POST",
        token,
        body: {
          ignoreUnknownValues: false,
          skipInvalidRows: false,
          rows: chunk,
        },
      },
    );

    if (response.insertErrors?.length) {
      throw new Error(
        `BigQuery insertAll returned ${response.insertErrors.length} row error(s) for ${datasetId}.${tableId}: ${JSON.stringify(response.insertErrors)}`,
      );
    }

    insertedRowCount += chunk.length;
  }

  return { insertedRowCount };
}
