export const WRITE_INTENT_HEADER = "x-nextstop-write-intent";
export const WRITE_INTENT_VALUE = "human-review";

const NO_STORE_HEADERS = {
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff"
};

export function securityJson(payload: unknown, status = 200) {
  return Response.json(payload, { status, headers: NO_STORE_HEADERS });
}

export function validateWriteRequest(request: Request): Response | null {
  const origin = request.headers.get("origin");
  const contentType = request.headers.get("content-type") || "";
  const fetchSite = request.headers.get("sec-fetch-site");
  const intent = request.headers.get(WRITE_INTENT_HEADER);

  // Browser mutation requests must carry an explicit Origin. This deliberately
  // rejects curl/script requests that omit Origin instead of treating them as trusted.
  if (!origin) {
    return securityJson({ error: "Write request origin is required." }, 403);
  }

  let requestOrigin: string;
  let suppliedOrigin: string;
  try {
    requestOrigin = new URL(request.url).origin;
    suppliedOrigin = new URL(origin).origin;
  } catch {
    return securityJson({ error: "Invalid write request origin." }, 403);
  }

  if (suppliedOrigin !== requestOrigin) {
    return securityJson({ error: "Cross-origin writes are not allowed." }, 403);
  }

  if (fetchSite && fetchSite !== "same-origin") {
    return securityJson({ error: "Cross-site writes are not allowed." }, 403);
  }

  // A non-simple custom header forces a browser CORS preflight for cross-origin
  // callers. We never grant CORS for mutation routes.
  if (intent !== WRITE_INTENT_VALUE) {
    return securityJson({ error: "Write intent header is required." }, 403);
  }

  if (!/^application\/json(?:\s*;|$)/i.test(contentType)) {
    return securityJson({ error: "Content-Type must be application/json." }, 415);
  }

  return null;
}

export function rejectMutationPreflight(allow: "POST" | "PATCH") {
  return new Response(null, {
    status: 405,
    headers: {
      ...NO_STORE_HEADERS,
      Allow: allow
    }
  });
}
