/**
 * Optional food and access needs a traveler can save. The lists are fixed (the database
 * only accepts these values), and the only place they act is the AI planner's request:
 * see needsFacts. They never change prices and are never shared or put in share links.
 */

export const DIETARY = [
  { id: "vegetarian", label: "Vegetarian" },
  { id: "vegan", label: "Vegan" },
  { id: "gluten-free", label: "Gluten-free" },
  { id: "dairy-free", label: "Dairy-free" },
  { id: "halal", label: "Halal" },
  { id: "kosher", label: "Kosher" },
  { id: "nut-allergy", label: "Nut allergy" },
  { id: "shellfish-allergy", label: "Shellfish allergy" },
] as const;

export const ACCESSIBILITY = [
  { id: "step-free", label: "Step-free access" },
  { id: "wheelchair", label: "Wheelchair user" },
  { id: "limited-walking", label: "Limited walking" },
  { id: "low-vision", label: "Low vision" },
  { id: "hearing", label: "Deaf or hard of hearing" },
  { id: "sensory-friendly", label: "Sensory-friendly places" },
] as const;

export type DietaryNeed = (typeof DIETARY)[number]["id"];
export type AccessNeed = (typeof ACCESSIBILITY)[number]["id"];

/** Only values from the fixed lists, once each (anything else the database sent is ignored). */
export function cleanNeeds<T extends string>(value: unknown, list: readonly { id: T }[]): T[] {
  if (!Array.isArray(value)) return [];
  const ids = new Set<string>(list.map((x) => x.id));
  return [...new Set(value.filter((v): v is T => typeof v === "string" && ids.has(v)))];
}

const labelOf = (list: readonly { id: string; label: string }[], id: string) =>
  list.find((x) => x.id === id)?.label.toLowerCase() ?? id;

/**
 * Lines for the AI planner's request (each within its 160-character note limit). They ask for
 * fitting places and forbid claiming a place meets a need unless Waypoint's own place data says so.
 */
export function needsFacts(dietary: readonly string[], access: readonly string[]): string[] {
  const out: string[] = [];
  if (dietary.length > 0)
    out.push(
      `Dietary needs: ${dietary.map((d) => labelOf(DIETARY, d)).join(", ")}. Favor restaurants likely to suit them; never say a place is certified or safe.`,
    );
  if (access.length > 0)
    out.push(
      `Access needs: ${access.map((a) => labelOf(ACCESSIBILITY, a)).join(", ")}. Favor accessible places and short walks; tell them to confirm access with the venue.`,
    );
  return out.map((l) => l.slice(0, 160));
}
