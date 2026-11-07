import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  // Capsules, as on apple.com. `pressable`: shrinks the instant the pointer goes down, springs back on release.
  "pressable inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full text-sm font-medium cursor-pointer select-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-40 disabled:cursor-not-allowed [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "bg-primary font-semibold text-primary-foreground hover:bg-primary-deep",
        destructive: "bg-destructive text-destructive-foreground hover:bg-destructive/90",
        // Bordered: a tinted fill, no outline stroke (HIG "gray" button).
        outline: "bg-fill text-foreground hover:bg-secondary",
        secondary: "bg-fill text-secondary-foreground hover:bg-secondary",
        ghost: "text-foreground hover:bg-fill",
        link: "text-primary underline-offset-4 hover:underline [&]:h-auto [&]:px-0",
        // Primary call to action: solid ink, inverts in dark mode.
        hero: "bg-ink font-semibold text-ink-foreground hover:opacity-90",
        // "Go" actions that move the trip forward (Plan trip, Start planning).
        go: "bg-go font-semibold text-go-foreground hover:bg-go-deep",
        ink: "bg-ink font-semibold text-ink-foreground hover:opacity-90",
        shield: "bg-shield text-shield-foreground hover:opacity-90",
        success: "bg-fill text-foreground hover:text-success",
      },
      size: {
        // 44px: the smallest comfortable touch target.
        default: "h-11 px-6",
        sm: "h-8 px-4 text-footnote",
        lg: "h-12 px-8 text-body",
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
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />
    );
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };
