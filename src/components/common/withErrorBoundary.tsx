import type { ComponentType } from "react";
import { DialogErrorBoundary, type DialogLikeProps } from "./ErrorBoundary";

/** Wraps a dialog / sheet component so its crash stays inside it. */
export function withErrorBoundary<P extends object>(Inner: ComponentType<P>, name: string): ComponentType<P> {
  const Wrapped = (props: P) => (
    <DialogErrorBoundary name={name} props={props as DialogLikeProps}>
      <Inner {...props} />
    </DialogErrorBoundary>
  );
  Wrapped.displayName = name;
  return Wrapped;
}
