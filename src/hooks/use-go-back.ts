import { useCallback } from "react";
import { useNavigate } from "react-router-dom";

/**
 * True when there's an in-app screen to go back to. React Router's
 * BrowserRouter stamps an increasing `idx` into history.state for every
 * in-app navigation — 0 means this is the first page of the session in this
 * tab (opened from a link, a bookmark, or refreshed straight onto it).
 */
export function canGoBackInApp(): boolean {
  const idx = (window.history.state as { idx?: number } | null)?.idx;
  return typeof idx === "number" && idx > 0;
}

/**
 * App-wide back: returns to the screen the user actually came from (browser
 * history), e.g. a quote opened from its project page goes back to that
 * project, not the Quotes list. With no in-app history, goes to `fallback`,
 * the page's sensible parent route.
 */
export function useGoBack(fallback: string) {
  const navigate = useNavigate();
  return useCallback(() => {
    if (canGoBackInApp()) navigate(-1);
    else navigate(fallback);
  }, [navigate, fallback]);
}
