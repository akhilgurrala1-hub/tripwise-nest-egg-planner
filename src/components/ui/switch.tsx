import * as React from "react";
import * as SwitchPrimitives from "@radix-ui/react-switch";

import { cn } from "@/lib/utils";

const Switch = React.forwardRef<
  React.ElementRef<typeof SwitchPrimitives.Root>,
  React.ComponentPropsWithoutRef<typeof SwitchPrimitives.Root>
>(({ className, ...props }, ref) => (
  <SwitchPrimitives.Root
    // iOS switch: 51 × 31, gray off, brand blue on; the knob springs across and
    // stretches while held, like the real one.
    className={cn(
      "peer group relative inline-flex h-[31px] w-[51px] shrink-0 cursor-pointer items-center rounded-full transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-40 data-[state=checked]:bg-primary data-[state=unchecked]:bg-[oklch(0.5_0.01_265/0.18)] dark:data-[state=unchecked]:bg-[oklch(1_0_0/0.16)]",
      className,
    )}
    {...props}
    ref={ref}
  >
    <SwitchPrimitives.Thumb
      className={cn(
        "pointer-events-none block h-[27px] w-[27px] rounded-full bg-white shadow-[0_3px_8px_oklch(0_0_0/0.15),0_1px_1px_oklch(0_0_0/0.16)] [transition:translate_var(--spring-bouncy-ms,610ms)_var(--ease-spring-bouncy),width_360ms_var(--ease-spring-press)] translate-x-[2px] group-active:w-[33px] data-[state=checked]:translate-x-[22px] group-active:data-[state=checked]:translate-x-[16px]",
      )}
    />
  </SwitchPrimitives.Root>
));
Switch.displayName = SwitchPrimitives.Root.displayName;

export { Switch };
