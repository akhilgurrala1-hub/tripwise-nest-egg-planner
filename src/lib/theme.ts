import { useEffect, useState } from "react";

export type ThemePref = "light" | "dark" | "system";
const KEY = "waypoint.theme";

/** Runs before first paint (inlined in the document head) so the right theme shows immediately. */
/** Browser-chrome color per theme: the page background, so the toolbar blends in. */
export const THEME_COLORS = { light: "#FBFBFC", dark: "#111216" } as const;

export const THEME_BOOT_SCRIPT = `(function(){var d=false;try{var p=localStorage.getItem("${KEY}")||"system";d=p==="dark"||(p==="system"&&window.matchMedia("(prefers-color-scheme: dark)").matches);document.documentElement.classList.toggle("dark",d);}catch(e){}var m=document.createElement("meta");m.name="theme-color";m.content=d?"${THEME_COLORS.dark}":"${THEME_COLORS.light}";document.head.appendChild(m);})();`;

function setThemeColor(dark: boolean) {
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute("content", dark ? THEME_COLORS.dark : THEME_COLORS.light);
}

function apply(pref: ThemePref) {
  const dark =
    pref === "dark" ||
    (pref === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.classList.toggle("dark", dark);
  setThemeColor(dark);
}

export function useTheme() {
  const [pref, setPref] = useState<ThemePref>("system");

  useEffect(() => {
    const stored = (localStorage.getItem(KEY) as ThemePref | null) ?? "system";
    setPref(stored);
  }, []);

  useEffect(() => {
    if (pref !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => apply("system");
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [pref]);

  const set = (next: ThemePref) => {
    setPref(next);
    try {
      localStorage.setItem(KEY, next);
    } catch {
      /* storage unavailable */
    }
    apply(next);
  };

  return { pref, setPref: set };
}
