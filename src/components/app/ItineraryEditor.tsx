import {
  ArrowDown,
  ArrowUp,
  CalendarDays,
  MoreHorizontal,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { NumberField } from "@/components/app/bits";
import { Segmented } from "@/components/app/motion";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatCalendarDate } from "@/lib/dates";
import type { ItemKind, Itinerary, ItineraryItem, SlotTime } from "@/lib/itinerary";
import { SLOT_ORDER, canMove } from "@/lib/itinerary-edit";
import { tripActions } from "@/lib/trip-store";

const KINDS: { value: ItemKind; label: string }[] = [
  { value: "sight", label: "Sight" },
  { value: "restaurant", label: "Meal" },
  { value: "stop", label: "Stop" },
];

export type ItemDraft = Pick<
  ItineraryItem,
  "name" | "time" | "kind" | "area" | "note" | "costPerPerson"
>;

const emptyDraft = (time: SlotTime = "Afternoon"): ItemDraft => ({
  name: "",
  time,
  kind: time === "Lunch" || time === "Dinner" ? "restaurant" : "sight",
  area: "",
  note: "",
  costPerPerson: 0,
});

/** One dialog for adding and editing an itinerary item. */
export function ItemDialog({
  open,
  onOpenChange,
  initial,
  mode,
  dayLabel,
  onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initial?: ItemDraft | undefined;
  mode: "add" | "edit";
  dayLabel: string;
  onSave: (draft: ItemDraft) => void;
}) {
  const [draft, setDraft] = useState<ItemDraft>(initial ?? emptyDraft());
  useEffect(() => {
    if (open) setDraft(initial ?? emptyDraft());
  }, [open, initial]);
  const set = (patch: Partial<ItemDraft>) => setDraft((d) => ({ ...d, ...patch }));
  const valid = draft.name.trim().length > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!valid) return;
            onSave({
              ...draft,
              name: draft.name.trim(),
              area: draft.area.trim(),
              note: draft.note.trim(),
            });
            onOpenChange(false);
          }}
          className="space-y-4"
        >
          <DialogHeader>
            <DialogTitle>{mode === "add" ? "Add to your plan" : "Edit this stop"}</DialogTitle>
            <DialogDescription>{dayLabel}</DialogDescription>
          </DialogHeader>

          <div>
            <Label htmlFor="item-name" className="text-[13px] font-normal text-muted-foreground">
              Name
            </Label>
            <Input
              id="item-name"
              autoFocus
              maxLength={120}
              placeholder="e.g. Tennessee Aquarium"
              value={draft.name}
              onChange={(e) => set({ name: e.target.value })}
              className="mt-1.5"
            />
          </div>

          <div>
            <p className="mb-1.5 text-[13px] text-muted-foreground">When</p>
            <Segmented
              ariaLabel="Time of day"
              size="sm"
              value={draft.time}
              onChange={(time) => set({ time })}
              options={SLOT_ORDER.map((t) => ({ value: t, label: t }))}
            />
          </div>

          <div className="grid grid-cols-[auto_1fr] items-end gap-3">
            <div>
              <p className="mb-1.5 text-[13px] text-muted-foreground">Type</p>
              <Segmented
                ariaLabel="Type"
                size="sm"
                value={draft.kind}
                onChange={(kind) => set({ kind })}
                options={KINDS}
              />
            </div>
            <div>
              <Label className="text-[13px] font-normal text-muted-foreground">
                Cost per person
              </Label>
              <NumberField
                aria-label="Cost per person"
                prefix="$"
                step={5}
                value={draft.costPerPerson}
                onChange={(costPerPerson) => set({ costPerPerson })}
                className="mt-1.5 h-10"
              />
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="item-area" className="text-[13px] font-normal text-muted-foreground">
                Where (optional)
              </Label>
              <Input
                id="item-area"
                maxLength={120}
                placeholder="Neighborhood or address"
                value={draft.area}
                onChange={(e) => set({ area: e.target.value })}
                className="mt-1.5"
              />
            </div>
            <div>
              <Label htmlFor="item-note" className="text-[13px] font-normal text-muted-foreground">
                Note (optional)
              </Label>
              <Input
                id="item-note"
                maxLength={140}
                placeholder="Book ahead, bring cash…"
                value={draft.note}
                onChange={(e) => set({ note: e.target.value })}
                className="mt-1.5"
              />
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="hero" disabled={!valid}>
              {mode === "add" ? "Add to day" : "Save changes"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Per-item controls: quick up/down on hover, and a menu with edit, move to day and remove (with Undo). */
export function ItemActions({
  item,
  itinerary,
  dayIndex,
}: {
  item: ItineraryItem;
  itinerary: Itinerary;
  dayIndex: number;
}) {
  const [editing, setEditing] = useState(false);
  const up = canMove(itinerary, item.id, -1);
  const down = canMove(itinerary, item.id, 1);
  const day = itinerary.days[dayIndex]!;

  const remove = () => {
    const removed = tripActions.removeItineraryItem(item.id);
    if (!removed) return;
    toast(`Removed “${item.name}”`, {
      action: { label: "Undo", onClick: () => tripActions.restoreItineraryItem(removed) },
    });
  };

  return (
    <div className="flex shrink-0 items-center gap-0.5">
      <div className="hidden items-center gap-0.5 opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100 sm:flex">
        <IconButton
          label={`Move ${item.name} earlier`}
          disabled={!up}
          onClick={() => tripActions.moveItineraryItem(item.id, -1)}
        >
          <ArrowUp />
        </IconButton>
        <IconButton
          label={`Move ${item.name} later`}
          disabled={!down}
          onClick={() => tripActions.moveItineraryItem(item.id, 1)}
        >
          <ArrowDown />
        </IconButton>
      </div>
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="size-8 text-muted-foreground"
            aria-label={`Options for ${item.name}`}
          >
            <MoreHorizontal />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
          <DropdownMenuItem onSelect={() => setEditing(true)}>
            <Pencil className="size-4" /> Edit
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled={!up}
            onSelect={() => tripActions.moveItineraryItem(item.id, -1)}
          >
            <ArrowUp className="size-4" /> Move earlier
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled={!down}
            onSelect={() => tripActions.moveItineraryItem(item.id, 1)}
          >
            <ArrowDown className="size-4" /> Move later
          </DropdownMenuItem>
          {itinerary.days.length > 1 && (
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>
                <CalendarDays className="size-4" /> Move to day
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent>
                {itinerary.days.map((d, i) => (
                  <DropdownMenuItem
                    key={d.day}
                    disabled={i === dayIndex}
                    onSelect={() => {
                      tripActions.moveItineraryItemToDay(item.id, i);
                      toast(`Moved to day ${d.day}`);
                    }}
                  >
                    Day {d.day} ·{" "}
                    {formatCalendarDate(d.date, {
                      weekday: "short",
                      month: "short",
                      day: "numeric",
                    })}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuSubContent>
            </DropdownMenuSub>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={remove} className="text-destructive focus:text-destructive">
            <Trash2 className="size-4" /> Remove
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <ItemDialog
        open={editing}
        onOpenChange={setEditing}
        mode="edit"
        dayLabel={`Day ${day.day} · ${formatCalendarDate(day.date, { weekday: "long", month: "long", day: "numeric" })}`}
        initial={{
          name: item.name,
          time: item.time,
          kind: item.kind,
          area: item.area,
          note: item.note,
          costPerPerson: item.costPerPerson,
        }}
        onSave={(draft) => {
          tripActions.updateItineraryItem(item.id, draft);
          toast.success("Saved");
        }}
      />
    </div>
  );
}

/** "Add to this day" control at the bottom of a day. */
export function AddItemButton({ dayIndex, itinerary }: { dayIndex: number; itinerary: Itinerary }) {
  const [open, setOpen] = useState(false);
  const day = itinerary.days[dayIndex]!;
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex min-h-11 w-full items-center gap-2 rounded-lg border border-dashed border-border px-3 text-[13px] text-muted-foreground transition-colors hover:border-muted-foreground/40 hover:text-foreground active:scale-[0.99]"
      >
        <Plus className="size-4" /> Add to day {day.day}
      </button>
      <ItemDialog
        open={open}
        onOpenChange={setOpen}
        mode="add"
        dayLabel={`Day ${day.day} · ${formatCalendarDate(day.date, { weekday: "long", month: "long", day: "numeric" })}`}
        onSave={(draft) => {
          tripActions.addItineraryItem(dayIndex, draft);
          toast.success(`Added “${draft.name}” to day ${day.day}`);
        }}
      />
    </>
  );
}

function IconButton({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string;
  disabled: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className="size-7 text-muted-foreground [&_svg]:size-3.5"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
    >
      {children}
    </Button>
  );
}
