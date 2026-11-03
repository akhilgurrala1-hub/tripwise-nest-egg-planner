import "./lib/error-capture";

import { consumeLastCapturedError } from "./lib/error-capture";
import { renderErrorPage } from "./lib/error-page";

type ServerEntry = {
  fetch: (request: Request, env: unknown, ctx: unknown) => Promise<Response> | Response;
};

let serverEntryPromise: Promise<ServerEntry> | undefined;

async function getServerEntry(): Promise<ServerEntry> {
  if (!serverEntryPromise) {
    serverEntryPromise = import("@tanstack/react-start/server-entry").then(
      (m) => (m.default ?? m) as ServerEntry,
    );
  }
  return serverEntryPromise;
}

// h3 swallows in-handler throws into a normal 500 Response with body
// {"unhandled":true,"message":"HTTPError"} — try/catch alone never fires for those.
async function normalizeCatastrophicSsrResponse(response: Response): Promise<Response> {
  if (response.status < 500) return response;
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) return response;

  const body = await response.clone().text();
  if (!isH3SwallowedErrorBody(body)) return response;

  console.error(consumeLastCapturedError() ?? new Error(`h3 swallowed SSR error: ${body}`));
  return new Response(renderErrorPage(), {
    status: 500,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

function isH3SwallowedErrorBody(body: string): boolean {
  try {
    const payload = JSON.parse(body) as { unhandled?: unknown; message?: unknown };
    return payload.unhandled === true && payload.message === "HTTPError";
  } catch {
    return false;
  }
}

/** Request header carrying the visitor's approximate location (see src/lib/live/location.ts). */
const GEO_HEADER = "x-waypoint-visitor-geo";

/**
 * Cloudflare attaches the visitor's approximate city to each request (`request.cf`).
 * It's passed on as an internal header so the app can suggest a starting point
 * without asking a third party. Anything a client sent under that name is replaced.
 */
function withVisitorGeo(request: Request): Request {
  const cf = (request as Request & { cf?: Record<string, unknown> }).cf;
  // Never trust the header from outside, even where there's no Cloudflare data.
  if (!cf && !request.headers.has(GEO_HEADER)) return request;
  const headers = new Headers(request.headers);
  headers.delete(GEO_HEADER);
  if (!cf) return new Request(request, { headers });
  const lat = Number(cf["latitude"]);
  const lon = Number(cf["longitude"]);
  if (Number.isFinite(lat) && Number.isFinite(lon)) {
    headers.set(
      GEO_HEADER,
      encodeURIComponent(
        JSON.stringify({
          city: cf["city"] ?? "",
          regionCode: cf["regionCode"] ?? "",
          region: cf["region"] ?? "",
          country: cf["country"] ?? "",
          lat,
          lon,
        }),
      ),
    );
  }
  return new Request(request, { headers });
}

/**
 * Safe defaults on every response: no MIME sniffing, no full URLs (which can hold a
 * shared trip) sent to other sites, and only the browser features the app uses
 * (location, after the traveler taps "Use my location").
 */
const SECURITY_HEADERS: Record<string, string> = {
  "x-content-type-options": "nosniff",
  "referrer-policy": "strict-origin-when-cross-origin",
  "permissions-policy": "geolocation=(self), camera=(), microphone=(), payment=(), usb=()",
};

function withSecurityHeaders(response: Response): Response {
  const headers = new Headers(response.headers);
  for (const [k, v] of Object.entries(SECURITY_HEADERS)) if (!headers.has(k)) headers.set(k, v);
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

export default {
  async fetch(request: Request, env: unknown, ctx: unknown) {
    try {
      const handler = await getServerEntry();
      const response = await handler.fetch(withVisitorGeo(request), env, ctx);
      return withSecurityHeaders(await normalizeCatastrophicSsrResponse(response));
    } catch (error) {
      console.error(error);
      return withSecurityHeaders(
        new Response(renderErrorPage(), {
          status: 500,
          headers: { "content-type": "text/html; charset=utf-8" },
        }),
      );
    }
  },
};
