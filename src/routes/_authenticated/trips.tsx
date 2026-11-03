import { useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Check, Copy, FolderOpen, Loader2, Pencil, RotateCcw, Save, Trash2, X } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { PageHeader } from "@/components/app/TripHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  defaultTripName,
  deleteTripForever,
  duplicateTrip,
  renameTrip,
  saveCurrentTrip,
  saveCurrentTripAsNew,
  savedTripsQuery,
  setTripDeleted,
  type SavedTripRow,
} from "@/lib/account";
import { formatMoney } from "@/lib/budget";
import { getDestination } from "@/lib/demo-data";
import { tripActions, useTrip, type TripState } from "@/lib/trip-store";

export const Route = createFileRoute("/_authenticated/trips")({
  head: () => ({
    meta: [
      { title: "Saved trips | Waypoint" },
      {
        name: "description",
        content: "Open, rename, copy and delete the trips saved to your Waypoint account.",
      },
      { property: "og:title", content: "Saved trips | Waypoint" },
      {
        property: "og:description",
        content: "All your planned trips and budgets, saved to your account.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  loader: ({ context }) => context.queryClient.ensureQueryData(savedTripsQuery),
  component: TripsPage,
  errorComponent: ({ error }) => (
    <div role="alert" className="mx-auto max-w-3xl p-6 text-sm text-destructive">
      {error instanceof Error ? error.message : "Couldn't load your trips."}
    </div>
  ),
});

function summary(row: SavedTripRow) {
  const t = row.data as unknown as Partial<TripState>;
  if (!t?.setup) return "";
  const dest = getDestination(t.setup.destinationId, t.setup.customDestination);
  return `${dest.name} · ${t.setup.startDate} → ${t.setup.endDate} · ${t.setup.travelers} traveler${t.setup.travelers === 1 ? "" : "s"} · ${formatMoney(t.setup.totalBudget)} budget`;
}

function TripsPage() {
  const { data: rows } = useSuspenseQuery(savedTripsQuery);
  const { trip } = useTrip();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [saving, setSaving] = useState(false);
  const [newName, setNewName] = useState("");
  const refresh = () => queryClient.invalidateQueries({ queryKey: savedTripsQuery.queryKey });
  const active = rows.filter((r) => !r.deleted_at);
  const deleted = rows.filter((r) => r.deleted_at);

  const run = async (fn: () => Promise<unknown>, ok: string) => {
    try {
      await fn();
      toast.success(ok);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      refresh();
    }
  };

  const save = async () => {
    setSaving(true);
    const res = trip.cloud
      ? await saveCurrentTrip()
      : await saveCurrentTripAsNew(newName.trim() || defaultTripName());
    setSaving(false);
    refresh();
    if (res.ok) {
      toast.success("Trip saved to your account");
      setNewName("");
    } else if (res.conflict) {
      toast.error(res.error, {
        action: {
          label: "Save as a copy",
          onClick: async () => {
            const copy = await saveCurrentTripAsNew(
              `${trip.cloud?.name ?? defaultTripName()} (copy)`,
            );
            refresh();
            if (copy.ok) toast.success("Saved as a new trip");
            else toast.error(copy.error);
          },
        },
      });
    } else toast.error(res.error);
  };

  const open = (row: SavedTripRow) => {
    const ok = tripActions.openSavedTrip(row.data, {
      id: row.id,
      revision: row.revision,
      name: row.name,
      savedAt: row.updated_at,
    });
    if (!ok) {
      toast.error("This trip was saved in a format this version can't open.");
      return;
    }
    toast.success(`Opened “${row.name}”`);
    navigate({ to: "/dashboard" });
  };

  return (
    <div>
      <PageHeader eyebrow="Your account" title="Saved trips" showTrip={false} />
      <div className="mx-auto mt-6 max-w-4xl space-y-6 px-4">
        <section className="surface-card p-5">
          <h2 className="title-display text-[26px]">Trip you're planning now</h2>
          {trip.cloud ? (
            <p className="mt-1 text-sm text-muted-foreground">
              Saved as <strong className="text-foreground">{trip.cloud.name}</strong> · last saved{" "}
              {new Date(trip.cloud.savedAt).toLocaleString()}. Save again to keep your latest
              changes.
            </p>
          ) : (
            <p className="mt-1 text-sm text-muted-foreground">
              Not saved yet. It's only on this device until you save it.
            </p>
          )}
          <div className="mt-4 flex flex-wrap gap-2">
            {!trip.cloud && (
              <Input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder={defaultTripName()}
                maxLength={120}
                className="min-w-0 flex-1 sm:max-w-sm"
                aria-label="Trip name"
              />
            )}
            <Button variant="hero" onClick={save} disabled={saving}>
              {saving ? <Loader2 className="animate-spin" /> : <Save />}
              {trip.cloud ? "Save changes" : "Save to my account"}
            </Button>
            {trip.cloud && (
              <Button
                variant="outline"
                onClick={async () => {
                  const res = await saveCurrentTripAsNew(`${trip.cloud!.name} (copy)`);
                  refresh();
                  if (res.ok) toast.success("Saved as a new trip");
                  else toast.error(res.error);
                }}
              >
                <Copy /> Save as new trip
              </Button>
            )}
          </div>
        </section>

        <section className="space-y-3">
          <h2 className="title-display text-[26px]">All trips ({active.length})</h2>
          {active.length === 0 && (
            <div className="surface-card p-6 text-center text-sm text-muted-foreground">
              No saved trips yet.{" "}
              <Link to="/" className="font-semibold text-primary">
                Plan a trip
              </Link>{" "}
              and save it here.
            </div>
          )}
          {active.map((row) => (
            <TripRow
              key={row.id}
              row={row}
              isOpen={trip.cloud?.id === row.id}
              onOpen={() => open(row)}
              onRename={(name) => run(() => renameTrip(row.id, name), "Trip renamed")}
              onCopy={() => run(() => duplicateTrip(row), "Trip copied")}
              onDelete={() =>
                run(() => setTripDeleted(row.id, true), "Trip deleted").then(() =>
                  toast.message(`“${row.name}” moved to recently deleted`, {
                    action: {
                      label: "Undo",
                      onClick: () => run(() => setTripDeleted(row.id, false), "Trip restored"),
                    },
                  }),
                )
              }
            />
          ))}
        </section>

        {deleted.length > 0 && (
          <section className="space-y-3">
            <h2 className="text-[15px] font-semibold text-muted-foreground">Recently deleted</h2>
            {deleted.map((row) => (
              <div
                key={row.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-dashed border-border p-4"
              >
                <div className="min-w-0">
                  <p className="truncate font-semibold">{row.name}</p>
                  <p className="text-xs text-muted-foreground">
                    Deleted {new Date(row.deleted_at!).toLocaleDateString()}
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => run(() => setTripDeleted(row.id, false), "Trip restored")}
                  >
                    <RotateCcw /> Restore
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-destructive"
                    onClick={() => {
                      if (window.confirm(`Delete “${row.name}” forever? This can't be undone.`)) {
                        run(() => deleteTripForever(row.id), "Trip deleted forever");
                      }
                    }}
                  >
                    <Trash2 /> Delete forever
                  </Button>
                </div>
              </div>
            ))}
          </section>
        )}
      </div>
    </div>
  );
}

function TripRow({
  row,
  isOpen,
  onOpen,
  onRename,
  onCopy,
  onDelete,
}: {
  row: SavedTripRow;
  isOpen: boolean;
  onOpen: () => void;
  onRename: (name: string) => void;
  onCopy: () => void;
  onDelete: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(row.name);
  const commit = () => {
    const n = name.trim();
    setEditing(false);
    if (n && n !== row.name) onRename(n);
    else setName(row.name);
  };
  return (
    <div className="surface-card flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
      <div className="min-w-0 flex-1">
        {editing ? (
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              commit();
            }}
          >
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={120}
              autoFocus
              aria-label="New trip name"
            />
            <Button type="submit" size="icon" variant="outline" aria-label="Save name">
              <Check />
            </Button>
            <Button
              type="button"
              size="icon"
              variant="ghost"
              aria-label="Cancel rename"
              onClick={() => {
                setName(row.name);
                setEditing(false);
              }}
            >
              <X />
            </Button>
          </form>
        ) : (
          <p className="flex flex-wrap items-center gap-2 font-semibold">
            <span className="truncate">{row.name}</span>
            {isOpen && <Badge variant="success">Open now</Badge>}
          </p>
        )}
        <p className="mt-0.5 text-xs text-muted-foreground">{summary(row)}</p>
        <p className="text-xs text-muted-foreground">
          Updated {new Date(row.updated_at).toLocaleString()}
        </p>
      </div>
      <div className="flex flex-wrap gap-1.5">
        <Button size="sm" variant="ink" onClick={onOpen}>
          <FolderOpen /> Open
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => setEditing(true)}
          aria-label={`Rename ${row.name}`}
        >
          <Pencil /> Rename
        </Button>
        <Button size="sm" variant="outline" onClick={onCopy} aria-label={`Copy ${row.name}`}>
          <Copy /> Copy
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="text-destructive"
          onClick={onDelete}
          aria-label={`Delete ${row.name}`}
        >
          <Trash2 /> Delete
        </Button>
      </div>
    </div>
  );
}
