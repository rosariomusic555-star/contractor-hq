/** Status colors, used the same way on every Dashboard card: green = good / ready, amber = watch, red = act now. */
export type Tone = "green" | "amber" | "red" | "grey";
export const TONE_TEXT: Record<Tone, string> = { green: "text-success", amber: "text-warning-strong", red: "text-destructive", grey: "text-muted-foreground" };
export const TONE_DOT: Record<Tone, string> = { green: "bg-success", amber: "bg-warning", red: "bg-destructive", grey: "bg-muted-foreground/40" };
export const TONE_PILL: Record<Tone, string> = {
  green: "bg-success/10 text-success",
  amber: "bg-warning/15 text-warning-strong",
  red: "bg-destructive/10 text-destructive",
  grey: "bg-muted text-muted-foreground",
};
