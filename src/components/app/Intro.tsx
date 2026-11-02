import { Logo } from "./Logo";

/**
 * Opening animation, shown once per browser session. It is plain markup + CSS
 * (see `.intro` in styles.css) so it plays before JavaScript loads and can never
 * leave the page covered; the boot script hides it on later visits.
 */
export const INTRO_BOOT_SCRIPT = `(function(){try{if(sessionStorage.getItem("waypoint.intro")){document.documentElement.classList.add("no-intro")}else{sessionStorage.setItem("waypoint.intro","1")}}catch(e){document.documentElement.classList.add("no-intro")}})();`;

export function IntroOverlay() {
  return (
    <div className="intro" aria-hidden suppressHydrationWarning>
      <Logo className="gap-3.5" markClassName="size-14" wordClassName="text-[34px]" />
    </div>
  );
}
