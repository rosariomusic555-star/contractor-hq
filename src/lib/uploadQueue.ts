/* =============================================================================
 * Progress updates (0126) — background photo uploads with retry, so posting
 * from a job site on slow signal is "camera, note, share, done": the post
 * is saved first, photos follow and retry (2s → 5s → 15s → 30s → 60s) until
 * they land. Lives for the app session (a closed tab stops pending ones —
 * the post itself is already saved).
 * ========================================================================== */

export interface UploadJob {
  id: string;
  label: string;
  run: () => Promise<void>;
  /** Called once every job for this group has finished (ok or not). */
  group: string;
  attempts: number;
  status: "queued" | "uploading" | "retrying" | "done" | "failed";
  error?: string;
}

const DELAYS = [2000, 5000, 15000, 30000, 60000];
const jobs: UploadJob[] = [];
const listeners = new Set<() => void>();
const groupDone = new Map<string, () => void>();
let running = false;

const emit = () => listeners.forEach((l) => l());

export function subscribeUploads(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function uploadSnapshot(): { pending: number; failed: number } {
  return {
    pending: jobs.filter((j) => j.status === "queued" || j.status === "uploading" || j.status === "retrying").length,
    failed: jobs.filter((j) => j.status === "failed").length,
  };
}

/** Queue uploads; `onGroupDone` runs after the last one in the group settles. */
export function enqueueUploads(group: string, tasks: { label: string; run: () => Promise<void> }[], onGroupDone?: () => void) {
  if (onGroupDone) groupDone.set(group, onGroupDone);
  for (const t of tasks) jobs.push({ id: crypto.randomUUID(), label: t.label, run: t.run, group, attempts: 0, status: "queued" });
  emit();
  void pump();
}

function settleGroup(group: string) {
  const open = jobs.some((j) => j.group === group && j.status !== "done" && j.status !== "failed");
  if (!open) {
    groupDone.get(group)?.();
    groupDone.delete(group);
  }
}

async function pump() {
  if (running) return;
  running = true;
  try {
    for (;;) {
      const job = jobs.find((j) => j.status === "queued");
      if (!job) break;
      job.status = "uploading";
      emit();
      try {
        await job.run();
        job.status = "done";
      } catch (e) {
        job.attempts++;
        job.error = (e as Error).message;
        if (job.attempts >= DELAYS.length) job.status = "failed";
        else {
          job.status = "retrying";
          setTimeout(() => {
            job.status = "queued";
            void pump();
          }, DELAYS[job.attempts - 1]);
        }
      }
      emit();
      if (job.status === "done" || job.status === "failed") settleGroup(job.group);
    }
  } finally {
    running = false;
  }
}

/** Retry everything that gave up. */
export function retryFailedUploads() {
  for (const j of jobs) if (j.status === "failed") {
    j.status = "queued";
    j.attempts = 0;
  }
  emit();
  void pump();
}
