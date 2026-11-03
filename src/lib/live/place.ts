import type { DemoDestination } from "../demo-data";

/**
 * The real place to search for (hotels, sights, restaurants): the typed name for a
 * custom destination, home for a staycation, otherwise the area and its state.
 * Generic labels like "Custom destination" or "Staycation" never reach a search.
 */
export function destinationQuery(dest: DemoDestination, origin = "", homeCity = ""): string {
  if (dest.id === "hometown") return origin.trim() || homeCity.trim() || dest.name;
  // A cruise's sights are in its ports of call, not its departure city.
  if (dest.port) return dest.anchor?.name ?? dest.name;
  // Suggested places search their real town ("Gatlinburg, TN"), not the area's name.
  if (dest.id.startsWith("place:") && dest.anchor) return dest.anchor.name;
  if (dest.region === "Custom destination" || dest.region === "Staycation") return dest.name;
  return `${dest.name}, ${dest.region}`;
}
