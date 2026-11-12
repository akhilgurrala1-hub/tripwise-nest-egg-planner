// Pure editing operations on an itinerary. Each returns a new itinerary (never mutates),
// so the store can apply them and undo can restore exactly what was there.
import type { Itinerary, ItineraryItem, SlotTime } from "./itinerary";

export const SLOT_ORDER: SlotTime[] = ["Morning", "Lunch", "Afternoon", "Dinner", "Evening"];
const slotRank = (t: SlotTime) => SLOT_ORDER.indexOf(t);

export interface ItemLocation {
  dayIndex: number;
  index: number;
}

export function locateItem(itin: Itinerary, itemId: string): ItemLocation | null {
  for (let dayIndex = 0; dayIndex < itin.days.length; dayIndex++) {
    const index = itin.days[dayIndex]!.items.findIndex((i) => i.id === itemId);
    if (index >= 0) return { dayIndex, index };
  }
  return null;
}

function withDayItems(itin: Itinerary, dayIndex: number, items: ItineraryItem[]): Itinerary {
  return { ...itin, days: itin.days.map((d, i) => (i === dayIndex ? { ...d, items } : d)) };
}

/** Where a new item with this time slot belongs: after everything at the same or an earlier time. */
export function insertionIndex(items: ItineraryItem[], time: SlotTime): number {
  let at = 0;
  items.forEach((it, i) => {
    if (slotRank(it.time) <= slotRank(time)) at = i + 1;
  });
  return at;
}

export function newItemId(existing: Itinerary): string {
  const ids = new Set(existing.days.flatMap((d) => d.items.map((i) => i.id)));
  let n = ids.size + 1;
  while (ids.has(`custom-${n}`)) n++;
  return `custom-${n}`;
}

export function addItem(
  itin: Itinerary,
  dayIndex: number,
  item: Omit<ItineraryItem, "id">,
): Itinerary {
  const day = itin.days[dayIndex];
  if (!day) return itin;
  const next: ItineraryItem = { ...item, id: newItemId(itin), custom: true };
  const items = [...day.items];
  items.splice(insertionIndex(items, next.time), 0, next);
  return withDayItems(itin, dayIndex, items);
}

export type ItemPatch = Partial<
  Pick<ItineraryItem, "name" | "time" | "kind" | "area" | "note" | "costPerPerson">
>;

/**
 * Edit an item. A changed time slot moves it to its new place in the day; a changed price
 * becomes the traveler's own figure (no longer an estimate from the listing).
 */
export function updateItem(itin: Itinerary, itemId: string, patch: ItemPatch): Itinerary {
  const at = locateItem(itin, itemId);
  if (!at) return itin;
  const items = [...itin.days[at.dayIndex]!.items];
  const before = items[at.index]!;
  const priceChanged =
    patch.costPerPerson !== undefined && patch.costPerPerson !== before.costPerPerson;
  const after: ItineraryItem = {
    ...before,
    ...patch,
    costPerPerson: Math.max(0, Number(patch.costPerPerson ?? before.costPerPerson) || 0),
    custom: true,
    ...(priceChanged ? { costSource: "listed" as const } : {}),
  };
  if (after.time === before.time) {
    items[at.index] = after;
  } else {
    items.splice(at.index, 1);
    items.splice(insertionIndex(items, after.time), 0, after);
  }
  return withDayItems(itin, at.dayIndex, items);
}

/** Swap with the neighbor above (-1) or below (+1); the item takes that neighbor's time slot. */
export function moveItem(itin: Itinerary, itemId: string, direction: -1 | 1): Itinerary {
  const at = locateItem(itin, itemId);
  if (!at) return itin;
  const items = [...itin.days[at.dayIndex]!.items];
  const target = at.index + direction;
  if (target < 0 || target >= items.length) return itin;
  const a = items[at.index]!;
  const b = items[target]!;
  // Keep the day reading in time order: the two items trade slots as well as places.
  items[target] = { ...a, time: b.time };
  items[at.index] = { ...b, time: a.time };
  return withDayItems(itin, at.dayIndex, items);
}

export function canMove(itin: Itinerary, itemId: string, direction: -1 | 1): boolean {
  const at = locateItem(itin, itemId);
  if (!at) return false;
  const t = at.index + direction;
  return t >= 0 && t < itin.days[at.dayIndex]!.items.length;
}

/**
 * Drag an item to another position in its own day. The day keeps reading in time order, so the
 * time slots stay where they are and the items take them in their new order (the same idea as
 * moveItem, for any distance). Returns the same plan when nothing would change.
 */
export function reorderItem(itin: Itinerary, itemId: string, toIndex: number): Itinerary {
  const at = locateItem(itin, itemId);
  if (!at) return itin;
  const items = itin.days[at.dayIndex]!.items;
  const to = Math.max(0, Math.min(items.length - 1, Math.trunc(toIndex)));
  if (to === at.index) return itin;
  const slots = items.map((i) => i.time);
  const moved = [...items];
  const [item] = moved.splice(at.index, 1);
  moved.splice(to, 0, item!);
  return withDayItems(
    itin,
    at.dayIndex,
    moved.map((it, i) => (it.time === slots[i] ? it : { ...it, time: slots[i]! })),
  );
}

/** Move an item to another day, keeping its time slot. */
export function moveItemToDay(itin: Itinerary, itemId: string, toDay: number): Itinerary {
  const at = locateItem(itin, itemId);
  if (!at || at.dayIndex === toDay || !itin.days[toDay]) return itin;
  const item = itin.days[at.dayIndex]!.items[at.index]!;
  const fromItems = itin.days[at.dayIndex]!.items.filter((i) => i.id !== itemId);
  const toItems = [...itin.days[toDay]!.items];
  toItems.splice(insertionIndex(toItems, item.time), 0, item);
  return withDayItems(withDayItems(itin, at.dayIndex, fromItems), toDay, toItems);
}

export interface RemovedItem {
  item: ItineraryItem;
  at: ItemLocation;
}

export function removeItem(
  itin: Itinerary,
  itemId: string,
): { itinerary: Itinerary; removed: RemovedItem | null } {
  const at = locateItem(itin, itemId);
  if (!at) return { itinerary: itin, removed: null };
  const item = itin.days[at.dayIndex]!.items[at.index]!;
  const items = itin.days[at.dayIndex]!.items.filter((i) => i.id !== itemId);
  return { itinerary: withDayItems(itin, at.dayIndex, items), removed: { item, at } };
}

/** Undo a removal: the item goes back exactly where it was (clamped if the day changed since). */
export function restoreItem(itin: Itinerary, removed: RemovedItem): Itinerary {
  if (locateItem(itin, removed.item.id)) return itin;
  const day = itin.days[removed.at.dayIndex];
  if (!day) return itin;
  const items = [...day.items];
  items.splice(Math.min(removed.at.index, items.length), 0, removed.item);
  return withDayItems(itin, removed.at.dayIndex, items);
}

/**
 * When a plan is rebuilt (demo, AI or real places), the traveler's own stops carry over
 * to the same day number, placed by their time slot. Days beyond the new plan's length are dropped.
 */
export function keepCustomItems(
  previous: Itinerary | null,
  next: Itinerary,
): { itinerary: Itinerary; kept: number } {
  if (!previous) return { itinerary: next, kept: 0 };
  let out = next;
  let kept = 0;
  previous.days.forEach((d, dayIndex) => {
    if (!out.days[dayIndex]) return;
    for (const item of d.items.filter((i) => i.custom)) {
      const items = [...out.days[dayIndex]!.items];
      // Ids from the old plan may collide with the new plan's, so give carried items fresh ones.
      items.splice(insertionIndex(items, item.time), 0, { ...item, id: newItemId(out) });
      out = withDayItems(out, dayIndex, items);
      kept++;
    }
  });
  return { itinerary: out, kept };
}

/**
 * The day number a request is about ("make day 2 cheaper"). Null when it names no day, a day
 * that isn't on the trip, or several days: those go to the whole plan, never to one day.
 */
export function parseDayNumber(text: string, dayCount: number): number | null {
  const days = new Set([...text.matchAll(/\bdays?\s*(\d{1,2})\b/gi)].map((m) => Number(m[1])));
  if (days.size !== 1) return null;
  const n = [...days][0]!;
  return n >= 1 && n <= dayCount ? n : null;
}

/** What one person spends on a day's stops and meals, from the prices on its items. */
export function dayCostPerPerson(day: { items: ItineraryItem[] }): number {
  const sum = day.items.reduce(
    (s, i) => s + (Number.isFinite(i.costPerPerson) ? i.costPerPerson : 0),
    0,
  );
  return Math.round(sum * 100) / 100;
}

/**
 * Put a new version of one day into the plan. Every other day is returned exactly as it was
 * (same objects), and the stops the traveler added or edited on this day are kept.
 */
export function replaceDay(
  previous: Itinerary,
  dayIndex: number,
  newDay: { title: string; items: ItineraryItem[] },
): { itinerary: Itinerary; kept: number } {
  const old = previous.days[dayIndex];
  if (!old) return { itinerary: previous, kept: 0 };
  let out: Itinerary = {
    ...previous,
    days: previous.days.map((d, i) =>
      i === dayIndex ? { ...d, title: newDay.title || d.title, items: newDay.items } : d,
    ),
  };
  let kept = 0;
  for (const item of old.items.filter((i) => i.custom)) {
    const items = [...out.days[dayIndex]!.items];
    items.splice(insertionIndex(items, item.time), 0, { ...item, id: newItemId(out) });
    out = withDayItems(out, dayIndex, items);
    kept++;
  }
  return { itinerary: out, kept };
}

/** Put a day back exactly as it was (undo for replaceDay). */
export function restoreDay(
  itin: Itinerary,
  dayIndex: number,
  day: { title: string; items: ItineraryItem[] },
): Itinerary {
  if (!itin.days[dayIndex]) return itin;
  return {
    ...itin,
    days: itin.days.map((d, i) =>
      i === dayIndex ? { ...d, title: day.title, items: day.items } : d,
    ),
  };
}
