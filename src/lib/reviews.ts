/**
 * Where to read what real people say about a place: Google reviews, Reddit threads
 * and Tripadvisor. These are links that open each site's own search (free, no
 * keys); their reviews aren't copied into Waypoint or sent to the AI.
 */

export interface ReviewLink {
  site: "google" | "reddit" | "tripadvisor";
  label: string;
  url: string;
}

const enc = encodeURIComponent;
const city = (near: string) => near.split(",")[0]?.trim() || near.trim();

/** Review searches for one place, e.g. a museum or restaurant in the plan. */
export function placeReviewLinks(
  name: string,
  near: string,
  mapsUrl?: string | null,
): ReviewLink[] {
  const n = name.trim();
  if (!n) return [];
  const where = city(near);
  const q = where ? `${n} ${where}` : n;
  return [
    {
      site: "google",
      label: "Google reviews",
      // A Google Maps place page opens on its reviews; otherwise search for them.
      url: mapsUrl?.startsWith("https://")
        ? mapsUrl
        : `https://www.google.com/maps/search/?api=1&query=${enc(q)}`,
    },
    {
      site: "reddit",
      label: "Reddit",
      url: `https://www.reddit.com/search/?q=${enc(where ? `"${n}" ${where}` : `"${n}"`)}`,
    },
    {
      site: "tripadvisor",
      label: "Tripadvisor",
      url: `https://www.tripadvisor.com/Search?q=${enc(q)}`,
    },
  ];
}

/** Where travelers talk about a destination as a whole. */
export function destinationReviewLinks(place: string): ReviewLink[] {
  const where = place.trim();
  if (!where) return [];
  return [
    {
      site: "reddit",
      label: "Reddit travel tips",
      url: `https://www.reddit.com/search/?q=${enc(`${city(where)} travel tips`)}`,
    },
    {
      site: "tripadvisor",
      label: "Tripadvisor",
      url: `https://www.tripadvisor.com/Search?q=${enc(where)}`,
    },
    {
      site: "google",
      label: "Google Maps",
      url: `https://www.google.com/maps/search/?api=1&query=${enc(`things to do in ${where}`)}`,
    },
  ];
}
