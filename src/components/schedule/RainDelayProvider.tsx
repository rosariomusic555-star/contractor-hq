import { useCallback, useState, type ReactNode } from "react";
import { RainDelaySheet } from "./RainDelaySheet";
import { RainDelayContext, type RainDelayTarget as Target } from "./rainDelayContext";

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
  return (
    <RainDelayContext.Provider value={openSheet}>
      {children}
      {target && (
        <RainDelaySheet
          open={open}
          onOpenChange={setOpen}
          projectId={target.projectId}
          date={target.date}
          defaultReason={target.reason ?? "rain"}
        />
      )}
    </RainDelayContext.Provider>
  );
}
