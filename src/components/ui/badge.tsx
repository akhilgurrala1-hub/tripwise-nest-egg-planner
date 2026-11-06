import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center gap-2 rounded-md border px-2 py-1 text-micro font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 [&_svg]:size-3",
  {
    variants: {
      variant: {
        default: "border-transparent bg-primary text-primary-foreground",
        secondary: "border-border bg-transparent text-muted-foreground",
        destructive: "border-transparent bg-destructive-soft text-destructive",
        outline: "text-foreground",
        demo: "border-border bg-transparent text-muted-foreground",
        shield: "border-border bg-transparent text-foreground",
        success: "border-transparent bg-success-soft text-success",
        gold: "border-border bg-transparent text-foreground",
        ai: "border-transparent bg-accent text-foreground",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>, VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
