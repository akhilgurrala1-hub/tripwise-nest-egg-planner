import { useEffect, useState, type ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * A photo with real states instead of a broken-image icon: a soft placeholder in
 * the photo's own shape while it loads, a quick fade-in when it arrives, and a
 * designed fallback (or nothing) if it can't be loaded.
 */
export function Photo({
  src,
  alt,
  className,
  imgClassName,
  fallback = null,
  onFail,
  lazy = true,
  priority = false,
}: {
  src: string;
  alt: string;
  /** The frame: give it a size or aspect ratio */
  className?: string;
  imgClassName?: string;
  /** Shown when the photo can't be loaded */
  fallback?: ReactNode;
  onFail?: () => void;
  lazy?: boolean;
  /** The picture the page is waiting for: fetched first, never lazy. */
  priority?: boolean;
}) {
  const [state, setState] = useState<"loading" | "loaded" | "failed">("loading");
  useEffect(() => setState("loading"), [src]);
  if (state === "failed") return <>{fallback}</>;
  return (
    <span className={cn("relative block overflow-hidden", className)}>
      {state === "loading" && <span aria-hidden className="skeleton absolute inset-0" />}
      <img
        src={src}
        alt={alt}
        loading={lazy && !priority ? "lazy" : "eager"}
        fetchPriority={priority ? "high" : undefined}
        decoding="async"
        // A photo already in the cache never fires onLoad after hydration; the ref catches it.
        ref={(el) => {
          if (el?.complete && el.naturalWidth > 0 && state === "loading") setState("loaded");
        }}
        onLoad={() => setState("loaded")}
        onError={() => {
          setState("failed");
          onFail?.();
        }}
        className={cn(
          "absolute inset-0 size-full object-cover transition-opacity duration-300",
          state === "loaded" ? "opacity-100" : "opacity-0",
          imgClassName,
        )}
      />
    </span>
  );
}

/** A placeholder in the shape of content that's on its way (text lines, a card). */
export function Skeleton({ className }: { className?: string }) {
  return <span aria-hidden className={cn("skeleton block rounded-md", className)} />;
}

/**
 * What a list says before it has anything: what will appear here, and the one
 * action that fills it. Left-aligned, like the content it stands in for.
 */
export function EmptyState({
  icon,
  title,
  children,
  action,
  className,
}: {
  icon: ReactNode;
  title: string;
  children?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("surface-card flex items-start gap-4 p-6", className)}>
      <span
        aria-hidden
        className="grid size-11 shrink-0 place-items-center rounded-xl bg-fill text-foreground [&_svg]:size-5"
      >
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-headline">{title}</p>
        {children && <p className="mt-1 text-footnote text-muted-foreground">{children}</p>}
        {action && <div className="mt-4">{action}</div>}
      </div>
    </div>
  );
}
