import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { Loader2 } from "lucide-react";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  // Pills, as on argcoresolutions.com. `pressable`: shrinks the instant the pointer goes down, springs back on release.
  "pressable inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full border border-transparent text-footnote font-medium cursor-pointer select-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-40 disabled:cursor-not-allowed [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        // One primary per screen: burnt coral fill, cream text.
        default: "bg-brand text-brand-foreground hover:bg-brand-deep",
        destructive: "bg-destructive text-destructive-foreground hover:bg-destructive/90",
        // Secondary: a transparent pill with a hairline.
        outline: "border-border bg-transparent text-foreground hover:bg-fill",
        secondary: "border-border bg-transparent text-foreground hover:bg-fill",
        ghost: "text-foreground hover:bg-fill",
        link: "text-primary underline-offset-4 hover:underline [&]:h-auto [&]:px-0",
        hero: "bg-brand text-brand-foreground hover:bg-brand-deep",
        // "Go" actions that move the trip forward (Plan trip, Start planning).
        go: "bg-go text-go-foreground hover:bg-go-deep",
        ink: "bg-brand text-brand-foreground hover:bg-brand-deep",
        shield: "bg-shield text-shield-foreground hover:opacity-90",
        success: "border-border bg-transparent text-foreground hover:text-success",
      },
      size: {
        // 44px: the smallest comfortable touch target.
        default: "h-11 px-6",
        sm: "h-9 px-4 text-footnote",
        lg: "h-12 px-8 text-footnote",
        icon: "h-11 w-11",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  asChild?: boolean;
  /**
   * Work in progress: a spinner takes the icon's place, the label stays (so the
   * button keeps its size), and the button can't be pressed twice.
   */
  loading?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, loading = false, children, ...props }, ref) => {
    if (asChild)
      return (
        <Slot className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props}>
          {children}
        </Slot>
      );
    return (
      <button
        className={cn(
          buttonVariants({ variant, size, className }),
          loading && "[&>svg:not([data-spinner])]:hidden",
        )}
        ref={ref}
        {...props}
        disabled={props.disabled || loading}
        aria-busy={loading || undefined}
      >
        {loading && <Loader2 data-spinner aria-hidden className="animate-spin" />}
        {children}
      </button>
    );
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };
