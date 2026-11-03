import { createServerFn } from "@tanstack/react-start";

/**
 * The caller's own approximate city, from what Cloudflare already knows about the
 * request. Free (no external call) and only ever describes the person asking.
 */
export const getVisitorLocation = createServerFn({ method: "GET" }).handler(async () => {
  const [{ getRequest }, { parseVisitorGeo }] = await Promise.all([
    import("@tanstack/react-start/server"),
    import("./location"),
  ]);
  return parseVisitorGeo(getRequest()?.headers.get("x-waypoint-visitor-geo") ?? null);
});
