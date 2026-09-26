import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useBlocker } from "react-router-dom";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { useIsMobile } from "@/hooks/use-mobile";
import { UnsavedChangesContext, type UnsavedEntry, type UnsavedChangesRegistry } from "@/hooks/use-unsaved-changes-guard";

/** How long "Save & leave" waits for a save that never starts (e.g. the
 * page refused it) before giving up and staying. */
const SAVE_START_TIMEOUT_MS = 2500;

/**
 * The app's one navigation guard (React Router only supports one blocker at
 * a time, so pages register their editors here via useUnsavedChangesGuard
 * instead of each blocking on its own). Blocks leaving the current page —
 * a different pathname; hash / query changes on the same page never count
 * — while any registered editor is dirty and not mid-save, then asks:
 * Save & leave / Discard & leave / Stay. A bottom sheet on phones.
 */
export function UnsavedChangesProvider({ children }: { children: ReactNode }) {
  const entries = useRef(new Map<string, () => UnsavedEntry>());
  const [version, setVersion] = useState(0);
  const registry = useMemo<UnsavedChangesRegistry>(
    () => ({
      register: (id, get) => {
        entries.current.set(id, get);
        return () => {
          entries.current.delete(id);
          setVersion((v) => v + 1);
        };
      },
      notify: () => setVersion((v) => v + 1),
    }),
    [],
  );
  const all = useCallback(() => [...entries.current.values()].map((get) => get()), []);

  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      currentLocation.pathname !== nextLocation.pathname && all().some((e) => e.dirty && !e.saving),
  );

  // Save & leave: save every dirty editor, then go once they're all clean;
  // a save that ends with the page still dirty failed — stay (the page shows
  // its own error).
  const [saving, setSaving] = useState(false);
  const sawSaveStart = useRef(false);
  useEffect(() => {
    if (!saving || blocker.state !== "blocked") return;
    const list = all();
    if (list.some((e) => e.saving)) {
      sawSaveStart.current = true;
      return;
    }
    if (!list.some((e) => e.dirty)) {
      setSaving(false);
      blocker.proceed();
    } else if (sawSaveStart.current) {
      setSaving(false);
      blocker.reset();
    }
  }, [version, saving, blocker, all]);
  useEffect(() => {
    if (!saving) return;
    const t = window.setTimeout(() => {
      if (!sawSaveStart.current && all().some((e) => e.dirty)) {
        setSaving(false);
        if (blocker.state === "blocked") blocker.reset();
      }
    }, SAVE_START_TIMEOUT_MS);
    return () => window.clearTimeout(t);
  }, [saving, blocker, all]);

  const saveAndLeave = () => {
    sawSaveStart.current = false;
    setSaving(true);
    for (const e of all()) if (e.dirty) e.save();
  };
  const discardAndLeave = () => {
    for (const e of all()) if (e.dirty) e.discard();
    blocker.proceed?.();
  };
  const stay = () => {
    if (saving) return;
    blocker.reset?.();
  };

  const open = blocker.state === "blocked";

  return (
    <UnsavedChangesContext.Provider value={registry}>
      {children}
      <LeaveDialog open={open} saving={saving} onSave={saveAndLeave} onDiscard={discardAndLeave} onStay={stay} />
    </UnsavedChangesContext.Provider>
  );
}

function LeaveDialog({
  open,
  saving,
  onSave,
  onDiscard,
  onStay,
}: {
  open: boolean;
  saving: boolean;
  onSave: () => void;
  onDiscard: () => void;
  onStay: () => void;
}) {
  const isMobile = useIsMobile();
  const title = "Save changes before leaving?";
  const body = "You have unsaved changes on this page.";
  const buttons = (
    <>
      <Button onClick={onSave} disabled={saving} className="h-12 font-bold sm:h-10">
        {saving ? "Saving…" : "Save & leave"}
      </Button>
      <Button variant="outline" onClick={onDiscard} disabled={saving} className="h-12 sm:h-10">
        Discard & leave
      </Button>
      <Button variant="ghost" onClick={onStay} disabled={saving} className="h-12 sm:h-10">
        Stay
      </Button>
    </>
  );

  if (isMobile) {
    return (
      <Sheet open={open} onOpenChange={(o) => !o && onStay()}>
        <SheetContent side="bottom" className="rounded-t-2xl px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-5">
          <SheetHeader className="text-left">
            <SheetTitle>{title}</SheetTitle>
            <SheetDescription>{body}</SheetDescription>
          </SheetHeader>
          <div className="mt-4 flex flex-col gap-2">{buttons}</div>
        </SheetContent>
      </Sheet>
    );
  }
  return (
    <AlertDialog open={open} onOpenChange={(o) => !o && onStay()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{body}</AlertDialogDescription>
        </AlertDialogHeader>
        <div className="flex flex-col gap-2 sm:flex-row-reverse sm:justify-start">{buttons}</div>
      </AlertDialogContent>
    </AlertDialog>
  );
}
