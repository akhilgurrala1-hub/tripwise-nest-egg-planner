import { Toaster as Sonner } from "sonner";

type ToasterProps = React.ComponentProps<typeof Sonner>;

const Toaster = ({ ...props }: ToasterProps) => {
  return (
    <Sonner
      className="toaster group"
      toastOptions={{
        classNames: {
          // A banner on frosted glass, like a system notification: lit edge, no hard border.
          toast:
            "group toast group-[.toaster]:floating group-[.toaster]:rounded-2xl group-[.toaster]:border-0 group-[.toaster]:text-foreground group-[.toaster]:text-body group-[.toaster]:font-medium",
          description: "group-[.toast]:text-footnote group-[.toast]:text-muted-foreground",
          actionButton:
            "group-[.toast]:rounded-lg group-[.toast]:bg-primary group-[.toast]:font-semibold group-[.toast]:text-primary-foreground",
          cancelButton:
            "group-[.toast]:rounded-lg group-[.toast]:bg-fill group-[.toast]:text-foreground",
        },
      }}
      {...props}
    />
  );
};

export { Toaster };
