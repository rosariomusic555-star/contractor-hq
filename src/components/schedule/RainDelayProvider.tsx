import { useCallback, useState, type ReactNode } from "react";
import { RainDelaySheet } from "./RainDelaySheet";
import { HeadsUpContext, RainDelayContext, type HeadsUpTarget, type RainDelayTarget as Target } from "./rainDelayContext";
import { HeadsUpSheet } from "./HeadsUpSheet";

/**
 * One Rain delay sheet for the whole app (0120), so it can be opened from a
 * forecast popover, a "⋯" menu, the dashboard risks card or the Bookings job
 * card without living inside (and closing with) any of them.
 */
export function RainDelayProvider({ children }: { children: ReactNode }) {
  const [target, setTarget] = useState<Target | null>(null);
  const [open, setOpen] = useState(false);
  const openSheet = useCallback((t: Target) => {
    setTarget(t);
    setOpen(true);
  }, []);
  // Client heads-up (0121) — same idea: one sheet, opened from anywhere.
  const [headsUp, setHeadsUp] = useState<HeadsUpTarget | null>(null);
  const [headsUpOpen, setHeadsUpOpen] = useState(false);
  const openHeadsUp = useCallback((t: HeadsUpTarget) => {
    setHeadsUp(t);
    setHeadsUpOpen(true);
  }, []);
  return (
    <RainDelayContext.Provider value={openSheet}>
      <HeadsUpContext.Provider value={openHeadsUp}>
      {children}
      {headsUp && <HeadsUpSheet open={headsUpOpen} onOpenChange={setHeadsUpOpen} target={headsUp} />}
      {target && (
        <RainDelaySheet
          open={open}
          onOpenChange={setOpen}
          projectId={target.projectId}
          date={target.date}
          defaultReason={target.reason ?? "rain"}
        />
      )}
      </HeadsUpContext.Provider>
    </RainDelayContext.Provider>
  );
}
