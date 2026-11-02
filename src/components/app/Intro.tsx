/**
 * Opening animation, shown once per browser session. It is plain markup + CSS
 * (see `.intro` in styles.css) so it plays before JavaScript loads and can never
 * leave the page covered; the boot script hides it on later visits.
 */
export const INTRO_BOOT_SCRIPT = `(function(){try{if(sessionStorage.getItem("waypoint.intro")){document.documentElement.classList.add("no-intro")}else{sessionStorage.setItem("waypoint.intro","1")}}catch(e){document.documentElement.classList.add("no-intro")}})();`;

export function IntroOverlay() {
  return (
    <div className="intro" aria-hidden suppressHydrationWarning>
      <div className="flex items-center gap-3 text-foreground">
        <LogoMark className="intro-mark size-9" />
        <span className="intro-word text-2xl font-semibold tracking-tight">Waypoint</span>
      </div>
    </div>
  );
}

/** A compass ring with a single heading needle: the brand mark. */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" fill="none" className={className} aria-hidden>
      <circle cx="16" cy="16" r="13" stroke="currentColor" strokeWidth="2" pathLength={100} />
      <path
        d="M16 7.5 L19.5 16 L16 24.5 L12.5 16 Z"
        stroke="var(--color-primary)"
        strokeWidth="2"
        strokeLinejoin="round"
        fill="none"
        pathLength={100}
      />
    </svg>
  );
}
