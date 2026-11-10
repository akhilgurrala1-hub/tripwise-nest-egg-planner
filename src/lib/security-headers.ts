/**
 * Safe defaults on every page response:
 * - no MIME sniffing;
 * - no full URLs (which can hold a shared trip) sent to other sites;
 * - only the browser features the app uses (location, after "Use my location");
 * - never shown inside another site's frame (clickjacking), no plugins, and no
 *   <base> tag pointing scripts elsewhere. The policy deliberately leaves scripts,
 *   styles, images and connections alone: the app loads photos, maps and data from
 *   many open sources, and a wrong allow-list would break pages.
 * HTTPS and HSTS are handled by Vercel.
 */
export const SECURITY_HEADERS: Record<string, string> = {
  "x-content-type-options": "nosniff",
  "referrer-policy": "strict-origin-when-cross-origin",
  "permissions-policy": "geolocation=(self), camera=(), microphone=(), payment=(), usb=()",
  "x-frame-options": "DENY",
  "content-security-policy": "frame-ancestors 'none'; object-src 'none'; base-uri 'self'",
};
