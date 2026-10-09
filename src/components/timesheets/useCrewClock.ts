import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { clockIn, clockOut, getMyTimesheet, type AssignedProject } from "@/lib/api";
import { isoDay } from "@/lib/timesheets";

/** Clock in / out for the signed-in crew member — shared by the clock card
 *  and the crew home banner. `quickJob`: the one job they're on today
 *  (one-tap clock in); otherwise clock in goes through My time. */
export function useCrewClock(todayJobs: AssignedProject[]) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const today = isoDay(new Date());
  const { data: ts } = useQuery({ queryKey: ["my-timesheet", today], queryFn: () => getMyTimesheet(today) });
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!ts?.running) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [ts?.running]);
  const refresh = () => qc.invalidateQueries({ queryKey: ["my-timesheet"] });
  const onError = (e: Error) => toast({ title: e.message, variant: "destructive" });
  const inMut = useMutation({ mutationFn: (pid: string) => clockIn(pid, today), onSuccess: () => (refresh(), toast({ title: "Clocked in" })), onError });
  const outMut = useMutation({ mutationFn: () => clockOut(0, null), onSuccess: () => (refresh(), toast({ title: "Clocked out — add a break on My time if you took one" })), onError });
  const quickJob = ts && todayJobs.length === 1 && ts.projects.some((p) => p.id === todayJobs[0].id) ? todayJobs[0] : null;
  return { ts, now, quickJob, inMut, outMut };
}
