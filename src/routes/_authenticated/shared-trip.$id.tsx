import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";

import { PageHeader } from "@/components/app/TripHeader";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { getDestination } from "@/lib/demo-data";
import { friendlyShareError, getSharedTrip, removeMember, sharedTripsQuery } from "@/lib/members";
import type { TripState } from "@/lib/trip-store";

export const Route = createFileRoute("/_authenticated/shared-trip/$id")({
  head: () => ({
    meta: [
      { title: "Shared trip | Waypoint" },
      { name: "description", content: "A trip plan someone shared with you." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: SharedPlan,
});

/**
 * A trip someone shared with you, read-only. The database sends only the plan: budget, prices,
 * bookings, spending and the owner's preferences are removed before it reaches this page.
 */
function SharedPlan() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const q = useQuery({
    queryKey: ["account", "shared-trip", id],
    queryFn: () => getSharedTrip(id),
  });
  const plan = q.data?.plan as unknown as Partial<TripState> | undefined;
  const setup = plan?.setup;
  const dest = setup ? getDestination(setup.destinationId, setup.customDestination) : null;

  const leave = async () => {
    if (!window.confirm("Leave this trip? You'll need a new invite to see it again.")) return;
    try {
      const { data } = await supabase.auth.getUser();
      if (data.user) await removeMember(id, data.user.id);
      void queryClient.invalidateQueries({ queryKey: sharedTripsQuery.queryKey });
      toast.success("You left the trip");
      void navigate({ to: "/trips" });
    } catch (e) {
      toast.error(friendlyShareError(e));
    }
  };

  return (
    <div>
      <PageHeader title={q.data?.name ?? "Shared trip"} showTrip={false} />
      <div className="mx-auto mt-6 max-w-3xl space-y-6 px-4 pb-24">
        {q.isLoading ? (
          <p className="text-muted-foreground">Loading…</p>
        ) : q.isError || !q.data ? (
          <div role="alert" className="space-y-4">
            <p>{friendlyShareError(q.error)}</p>
            <Button asChild variant="outline">
              <Link to="/trips">Back to my trips</Link>
            </Button>
          </div>
        ) : (
          <>
            <section className="surface-card p-6">
              <p className="text-sm text-muted-foreground">
                You're viewing this plan. The owner's budget, prices, bookings and spending are
                private and not shown.
              </p>
              {setup && dest && (
                <p className="mt-2 font-semibold">
                  {dest.name} · {setup.startDate} to {setup.endDate} · {setup.travelers} traveler
                  {setup.travelers === 1 ? "" : "s"}
                </p>
              )}
            </section>
            {(plan?.itinerary?.days ?? []).map((day) => (
              <section key={day.day} className="surface-card p-6">
                <h2 className="title-display text-title-2">
                  Day {day.day}: {day.title}
                </h2>
                <p className="text-xs text-muted-foreground">{day.date}</p>
                <ol className="mt-4 divide-y divide-separator">
                  {day.items.map((item) => (
                    <li key={item.id} className="py-2">
                      <p className="text-xs text-muted-foreground">{item.time}</p>
                      <p className="font-medium">{item.name}</p>
                      <p className="text-sm text-muted-foreground">
                        {item.area}
                        {item.note ? ` · ${item.note}` : ""}
                      </p>
                    </li>
                  ))}
                  {day.items.length === 0 && (
                    <li className="py-2 text-sm text-muted-foreground">Free day.</li>
                  )}
                </ol>
              </section>
            ))}
            {(plan?.itinerary?.days ?? []).length === 0 && (
              <p className="text-muted-foreground">The owner hasn't added days to this plan yet.</p>
            )}
            <div className="flex flex-wrap gap-2">
              <Button asChild variant="outline">
                <Link to="/trips">Back to my trips</Link>
              </Button>
              <Button variant="ghost" onClick={leave}>
                Leave this trip
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
