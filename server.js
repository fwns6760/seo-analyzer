const http = require("http");

const port = Number(process.env.PORT || 8080);
const projectId = process.env.GOOGLE_CLOUD_PROJECT || "unknown";
const service = process.env.K_SERVICE || "local";
const revision = process.env.K_REVISION || "local";
const sampleSecretPresent = Boolean(process.env.SAMPLE_SECRET_MESSAGE);

const server = http.createServer((req, res) => {
  const body = JSON.stringify(
    {
      ok: true,
      message: "seo-analyzer sample is running",
      path: req.url,
      projectId,
      service,
      revision,
      sampleSecretPresent,
      timestamp: new Date().toISOString(),
    },
    null,
    2,
  );

  res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
  res.end(body);
});

server.listen(port, "0.0.0.0", () => {
  console.log(`sample server listening on ${port}`);
});
