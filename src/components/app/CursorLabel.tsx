import { useEffect, useRef } from "react";

/**
 * A round label that follows the pointer over anything marked `data-cursor="Text"`.
 * Decorative: the element underneath stays the real, keyboard-reachable control.
 * Only on fine pointers, and never under reduced motion.
 */
export function CursorLabel() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    const ok =
      window.matchMedia("(hover: hover) and (pointer: fine)").matches &&
      !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!el || !ok) return;
    document.documentElement.classList.add("has-cursor-label");
    let x = 0;
    let y = 0;
    let tx = 0;
    let ty = 0;
    let raf = 0;
    let first = true;
    const place = () => {
      x += (tx - x) * 0.22;
      y += (ty - y) * 0.22;
      el.style.transform = `translate3d(${x}px, ${y}px, 0) translate(-50%, -50%)`;
      raf = Math.abs(tx - x) + Math.abs(ty - y) > 0.3 ? requestAnimationFrame(place) : 0;
    };
    const move = (e: PointerEvent) => {
      const hit = (e.target as Element | null)?.closest<HTMLElement>("[data-cursor]");
      if (!hit) {
        el.setAttribute("data-on", "false");
        return;
      }
      el.textContent = hit.getAttribute("data-cursor") ?? "";
      el.setAttribute("data-on", "true");
      tx = e.clientX;
      ty = e.clientY;
      if (first) {
        x = tx;
        y = ty;
        first = false;
      }
      if (!raf) raf = requestAnimationFrame(place);
    };
    const leave = () => {
      el.setAttribute("data-on", "false");
      first = true;
    };
    document.addEventListener("pointermove", move, { passive: true });
    document.documentElement.addEventListener("pointerleave", leave);
    return () => {
      document.removeEventListener("pointermove", move);
      document.documentElement.removeEventListener("pointerleave", leave);
      cancelAnimationFrame(raf);
      document.documentElement.classList.remove("has-cursor-label");
    };
  }, []);
  return <div ref={ref} aria-hidden className="cursor-label" data-on="false" />;
}
