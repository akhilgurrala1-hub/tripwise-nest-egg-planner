import { Loader2, Share2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { shareUrl } from "@/lib/share";
import { currentTrip, viewTrip } from "@/lib/trip-store";

const PRIVACY = "Anyone with the link can see the plan and budget. Your bookings aren't included.";

/**
 * Share the current trip as a link: the phone's share sheet where there is one,
 * otherwise the link is copied.
 */
export function ShareTripButton({ compact = false }: { compact?: boolean }) {
  const [busy, setBusy] = useState(false);

  const share = async () => {
    setBusy(true);
    try {
      const trip = currentTrip();
      const url = await shareUrl(trip, window.location.origin);
      const title = `Trip to ${viewTrip(trip).dest.name}`;
      const touch = window.matchMedia?.("(pointer: coarse)").matches;
      if (touch && typeof navigator.share === "function") {
        try {
          await navigator.share({ title, url });
          return;
        } catch (err) {
          if ((err as Error)?.name === "AbortError") return;
          /* no share sheet after all: copy instead */
        }
      }
      try {
        await navigator.clipboard.writeText(url);
        toast.success("Link copied", { description: PRIVACY });
      } catch {
        window.prompt("Copy this link to share your trip", url);
      }
    } catch {
      toast.error("Couldn't make a link for this trip. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  const icon = busy ? <Loader2 className="animate-spin" /> : <Share2 />;
  return compact ? (
    <Button
      variant="ghost"
      size="icon"
      onClick={share}
      disabled={busy}
      aria-label="Share this trip"
      title="Share this trip"
      className="print:hidden"
    >
      {icon}
    </Button>
  ) : (
    <Button variant="outline" onClick={share} disabled={busy} className="print:hidden">
      {icon} Share trip
    </Button>
  );
}
