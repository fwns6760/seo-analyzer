export function getPublicOrigin(request: Request) {
  const requestUrl = new URL(request.url);

  if (process.env.NODE_ENV === "development") {
    return requestUrl.origin;
  }

  const forwardedHost = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim();
  const forwardedProto = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();

  if (!forwardedHost) {
    return requestUrl.origin;
  }

  return `${forwardedProto ?? "https"}://${forwardedHost}`;
}

export function getPublicUrl(request: Request, path: string) {
  return new URL(path, getPublicOrigin(request)).toString();
}
