import { useEffect, useSyncExternalStore, type RefObject } from "react";

/**
 * iOS large titles: a page's big title scrolls away and a compact copy of it
 * appears in the bar. The page reports its title and whether it's out of view;
 * the bar reads it here.
 */
let state: { title: string; hidden: boolean } = { title: "", hidden: false };
const listeners = new Set<() => void>();
const set = (next: typeof state) => {
  if (next.title === state.title && next.hidden === state.hidden) return;
  state = next;
  for (const l of listeners) l();
};

export function useCompactTitle() {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => state,
    () => state,
  );
}

/** Watches the page's large title and tells the bar when it has scrolled under it. */
export function useLargeTitle(ref: RefObject<HTMLElement | null>, title: string) {
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(
      ([e]) => set({ title, hidden: !!e && !e.isIntersecting && e.boundingClientRect.top < 0 }),
      // The bar is 64px tall: the title counts as gone once it's under the bar.
      { rootMargin: "-64px 0px 0px 0px" },
    );
    io.observe(el);
    return () => {
      io.disconnect();
      set({ title: "", hidden: false });
    };
  }, [ref, title]);
}
