import * as React from "react";

import { cn } from "@/lib/utils";

const Textarea = React.forwardRef<HTMLTextAreaElement, React.ComponentProps<"textarea">>(
  ({ className, ...props }, ref) => {
    return (
      <textarea
        className={cn(
          "flex min-h-24 w-full py-2 rounded-xl border border-input bg-fill px-4 text-base transition-[border-color,box-shadow,background-color] duration-150 placeholder:text-muted-foreground/80 hover:border-muted-foreground/40 focus-visible:bg-card focus-visible:outline-none focus-visible:border-primary focus-visible:ring-3 focus-visible:ring-primary/15 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:bg-destructive-soft md:text-sm",
          className,
        )}
        ref={ref}
        {...props}
      />
    );
  },
);
Textarea.displayName = "Textarea";

export { Textarea };
