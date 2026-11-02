import { useQuery } from "@tanstack/react-query";
import { Loader2, MapPin } from "lucide-react";
import { useEffect, useId, useState } from "react";

import { Input } from "@/components/ui/input";
import { geocodeQuery } from "@/lib/live/use-live";
import { cn } from "@/lib/utils";

/** Text input with real place suggestions (free Open-Meteo geocoding). Free text is still accepted. */
export function PlaceInput({
  value,
  onChange,
  placeholder,
  id,
  autoFocus,
  className,
  "aria-label": ariaLabel,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  id?: string;
  autoFocus?: boolean;
  className?: string;
  "aria-label"?: string;
}) {
  const listId = useId();
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), 300);
    return () => clearTimeout(t);
  }, [value]);

  const q = useQuery({ ...geocodeQuery(debounced), enabled: open && debounced.trim().length >= 2 });
  const options = (q.data ?? []).filter(
    (p) => p.label.toLowerCase() !== value.trim().toLowerCase(),
  );
  const show = open && value.trim().length >= 2 && (options.length > 0 || q.isFetching);

  const pick = (label: string) => {
    onChange(label);
    setOpen(false);
    setActive(-1);
  };

  return (
    <div className="relative">
      <Input
        id={id}
        autoFocus={autoFocus}
        aria-label={ariaLabel}
        role="combobox"
        aria-expanded={show}
        aria-controls={listId}
        aria-autocomplete="list"
        autoComplete="off"
        placeholder={placeholder}
        value={value}
        maxLength={80}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
          setActive(-1);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={(e) => {
          if (!show) return;
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setActive((a) => Math.min(options.length - 1, a + 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActive((a) => Math.max(-1, a - 1));
          } else if (e.key === "Enter" && active >= 0 && options[active]) {
            e.preventDefault();
            pick(options[active].label);
          } else if (e.key === "Escape") setOpen(false);
        }}
        className={className}
      />
      {show && (
        <ul
          id={listId}
          role="listbox"
          className="absolute inset-x-0 top-full z-30 mt-1 overflow-hidden rounded-xl border border-border bg-popover py-1 text-popover-foreground shadow-lift"
        >
          {options.length === 0 && q.isFetching && (
            <li className="flex items-center gap-2 px-3 py-2 text-sm text-muted-foreground">
              <Loader2 className="size-3.5 animate-spin" /> Finding places…
            </li>
          )}
          {options.map((p, i) => (
            <li
              key={`${p.label}-${p.lat}`}
              role="option"
              aria-selected={i === active}
              onMouseDown={(e) => {
                e.preventDefault();
                pick(p.label);
              }}
              className={cn(
                "flex min-h-11 cursor-pointer items-center gap-2 px-3 py-2 text-sm",
                i === active ? "bg-secondary" : "hover:bg-secondary/70",
              )}
            >
              <MapPin className="size-3.5 shrink-0 text-primary" />
              <span className="font-semibold">{p.name}</span>
              <span className="truncate text-muted-foreground">
                {[p.admin1, p.countryCode === "US" ? "" : p.country].filter(Boolean).join(", ")}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
