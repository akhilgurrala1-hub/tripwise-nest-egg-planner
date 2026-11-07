import { useEffect } from "react";

/** What fades up as it scrolls in: content tiles and section titles. */
const SELECTOR = "main .surface-card, main h2.title-display, main .fade-up";

const FROM = { opacity: 0, transform: "translateY(32px)" };
const TO = { opacity: 1, transform: "none" };

/** The smooth spring as a CSS `linear()` easing, when the browser takes one. */
function springEasing() {
  const value = getComputedStyle(document.documentElement)
    .getPropertyValue("--ease-spring-smooth")
    .trim();
  if (!value) return "ease-out";
  try {
    document.body.animate([{ opacity: 1 }], { duration: 0, easing: value }).cancel();
    return value;
  } catch {
    return "ease-out";
  }
}

/**
 * apple.com's scroll reveal for the current page: anything below the fold waits
 * just out of place and fades up the first time it comes into view, then stays.
 * Content already on screen is left alone (no flash), content added later is
 * picked up, and nothing is hidden with reduced motion, for printing or before
 * this runs.
 *
 * It uses Web Animations only and never writes attributes or classes, so it
 * can't disturb React taking over the server's HTML (no hydration mismatch).
 */
export function useScrollReveal(key: string) {
  useEffect(() => {
    if (typeof IntersectionObserver === "undefined" || !document.body.animate) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const easing = springEasing();
    const seen = new WeakSet<Element>();
    const held = new Map<Element, Animation>();

    const reveal = (el: Element) => {
      held.get(el)?.cancel();
      held.delete(el);
      el.animate([FROM, TO], { duration: 1100, easing });
      el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 900, easing: "ease-out" });
    };
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue;
          io.unobserve(e.target);
          reveal(e.target);
        }
      },
      { rootMargin: "0px 0px -10% 0px", threshold: 0.05 },
    );
    const arm = (root: ParentNode) => {
      for (const el of root.querySelectorAll(SELECTOR)) {
        if (seen.has(el)) continue;
        seen.add(el);
        // Only what starts below the fold waits; what's already visible never blinks.
        if (el.getBoundingClientRect().top < window.innerHeight * 0.9) continue;
        held.set(el, el.animate([FROM], { duration: 1, fill: "forwards" }));
        io.observe(el);
      }
    };
    // Printing shows everything, revealed or not.
    const showAll = () => {
      for (const a of held.values()) a.cancel();
      held.clear();
      io.disconnect();
    };
    const main = document.querySelector("main");
    if (!main) return;
    // After the page's first layout, so positions are real.
    const raf = requestAnimationFrame(() => arm(document));
    const mo = new MutationObserver(() => arm(main));
    mo.observe(main, { childList: true, subtree: true });
    window.addEventListener("beforeprint", showAll);
    return () => {
      cancelAnimationFrame(raf);
      mo.disconnect();
      window.removeEventListener("beforeprint", showAll);
      showAll();
    };
  }, [key]);
}
