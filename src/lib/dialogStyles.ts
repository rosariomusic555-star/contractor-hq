/**
 * Extra DialogContent classes that turn a centered dialog into a bottom
 * sheet below `sm` (phones): pinned to the bottom edge, full width,
 * rounded top, sliding up — while staying a normal centered dialog from
 * `sm` up. Used by the Quick Quote picker + form.
 */
export const MOBILE_BOTTOM_SHEET =
  "max-sm:bottom-0 max-sm:left-0 max-sm:top-auto max-sm:max-w-none max-sm:translate-x-0 max-sm:translate-y-0 max-sm:rounded-b-none max-sm:rounded-t-2xl max-sm:pb-[max(1.5rem,env(safe-area-inset-bottom))] max-sm:data-[state=open]:slide-in-from-left-0 max-sm:data-[state=open]:slide-in-from-bottom-full max-sm:data-[state=open]:zoom-in-100 max-sm:data-[state=closed]:slide-out-to-left-0 max-sm:data-[state=closed]:slide-out-to-bottom-full max-sm:data-[state=closed]:zoom-out-100";
