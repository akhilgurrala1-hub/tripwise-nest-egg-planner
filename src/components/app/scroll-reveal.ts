import { useEffect } from "react";

/** What fades up as it scrolls in: content tiles and section titles. */
const SELECTOR = "main .surface-card, main h2.title-display, main .fade-up";

/**
 * apple.com's scroll reveal for the current page: anything below the fold waits
 * just out of place and fades up the first time it comes into view, then stays.
 * Content already on screen is left alone (no flash), content added later is
 * picked up, and nothing is hidden with reduced motion or before this runs.
 */
export function useScrollReveal(key: string) {
  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue;
          (e.target as HTMLElement).dataset["reveal"] = "shown";
          io.unobserve(e.target);
        }
      },
      { rootMargin: "0px 0px -10% 0px", threshold: 0.05 },
    );
    const arm = (root: ParentNode) => {
      for (const el of root.querySelectorAll<HTMLElement>(SELECTOR)) {
        if (el.dataset["reveal"]) continue;
        // Only what starts below the fold waits; what's already visible never blinks.
        if (el.getBoundingClientRect().top < window.innerHeight * 0.9) {
          el.dataset["reveal"] = "done";
          continue;
        }
        el.dataset["reveal"] = "pending";
        io.observe(el);
      }
    };
    const main = document.querySelector("main");
    if (!main) return;
    // After the page's first layout, so positions are real.
    const raf = requestAnimationFrame(() => arm(document));
    const mo = new MutationObserver(() => arm(main));
    mo.observe(main, { childList: true, subtree: true });
    return () => {
      cancelAnimationFrame(raf);
      mo.disconnect();
      io.disconnect();
    };
  }, [key]);
}
