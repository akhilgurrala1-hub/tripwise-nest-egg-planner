import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Copy, Link2, Loader2, UserMinus } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  createInvite,
  friendlyShareError,
  inviteUrl,
  invitesQuery,
  membersQuery,
  removeMember,
  revokeInvite,
} from "@/lib/members";

/**
 * The owner's view of who can look at a saved trip: people who joined, open invite links, and a
 * button to make a new link. A link works once, expires in 7 days and gives a viewer (plan only:
 * no budget, prices, bookings, spending or saved preferences).
 */
export function TripPeople({ tripId }: { tripId: string }) {
  const queryClient = useQueryClient();
  const members = useQuery(membersQuery(tripId));
  const invites = useQuery(invitesQuery(tripId));
  const [link, setLink] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: membersQuery(tripId).queryKey });
    void queryClient.invalidateQueries({ queryKey: invitesQuery(tripId).queryKey });
  };

  const make = async () => {
    setBusy(true);
    try {
      const token = await createInvite(tripId);
      setLink(inviteUrl(window.location.origin, token));
      refresh();
    } catch (e) {
      toast.error(friendlyShareError(e));
    } finally {
      setBusy(false);
    }
  };

  const copy = async () => {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      toast.success("Link copied");
    } catch {
      toast.message("Select the link and copy it");
    }
  };

  return (
    <div className="mt-4 space-y-4 border-t border-separator pt-4 text-sm">
      <p className="text-muted-foreground">
        People you invite can see the plan and nothing else: no budget, prices, bookings, spending
        or saved preferences. You can remove anyone at any time.
      </p>

      <div>
        <Button size="sm" variant="outline" onClick={make} disabled={busy}>
          {busy ? <Loader2 className="animate-spin" /> : <Link2 />} Make an invite link
        </Button>
        {link && (
          <div className="mt-4 space-y-2">
            <div className="flex gap-2">
              <input
                readOnly
                value={link}
                aria-label="Invite link"
                onFocus={(e) => e.currentTarget.select()}
                className="h-10 min-w-0 flex-1 rounded-lg border border-input bg-card px-4 text-xs"
              />
              <Button size="sm" variant="outline" onClick={copy}>
                <Copy /> Copy
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              This link is shown only now. It works once, expires in 7 days, and whoever opens it
              while signed in joins as a viewer, so send it only to the person you mean.
            </p>
          </div>
        )}
      </div>

      <div>
        <h3 className="font-semibold">People on this trip</h3>
        {members.isLoading ? (
          <p className="mt-2 text-muted-foreground">Loading…</p>
        ) : (members.data ?? []).length === 0 ? (
          <p className="mt-2 text-muted-foreground">Nobody has joined yet.</p>
        ) : (
          <ul className="mt-2 divide-y divide-separator">
            {(members.data ?? []).map((m, i) => (
              <li key={m.user_id} className="flex items-center justify-between gap-4 py-2">
                <span className="min-w-0 truncate">
                  {m.nickname || `Person ${i + 1}`}{" "}
                  <span className="text-muted-foreground">
                    · {m.role} · joined {new Date(m.created_at).toLocaleDateString()}
                  </span>
                </span>
                <Button
                  size="sm"
                  variant="ghost"
                  aria-label={`Remove ${m.nickname || `person ${i + 1}`}`}
                  onClick={async () => {
                    try {
                      await removeMember(tripId, m.user_id);
                      toast.success("Removed. They can no longer see this trip.");
                    } catch (e) {
                      toast.error(e instanceof Error ? e.message : friendlyShareError(e));
                    } finally {
                      refresh();
                    }
                  }}
                >
                  <UserMinus /> Remove
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {(invites.data ?? []).length > 0 && (
        <div>
          <h3 className="font-semibold">Open invite links</h3>
          <ul className="mt-2 divide-y divide-separator">
            {(invites.data ?? []).map((i) => (
              <li key={i.id} className="flex items-center justify-between gap-4 py-2">
                <span className="text-muted-foreground">
                  Made {new Date(i.created_at).toLocaleDateString()} · expires{" "}
                  {new Date(i.expires_at).toLocaleDateString()}
                </span>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={async () => {
                    try {
                      await revokeInvite(i.id);
                      toast.success("Link cancelled");
                    } catch (e) {
                      toast.error(friendlyShareError(e));
                    } finally {
                      refresh();
                    }
                  }}
                >
                  Cancel link
                </Button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
