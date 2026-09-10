import { useEffect } from "react";
import { useLocation, useNavigationType } from "react-router-dom";

/**
 * Resets scroll to the top whenever the route changes (clicking a Link/
 * NavLink, or a programmatic navigate() — e.g. the dashboard's "New quote"
 * button). React Router doesn't do this itself; without it, navigating to a
 * new page keeps whatever scroll position the previous page was at.
 *
 * Browser back/forward (POP) is left alone so the browser's own scroll
 * restoration can put the user back where they were on a list they came
 * from.
 */
export function ScrollToTop() {
  const { pathname } = useLocation();
  const navigationType = useNavigationType();

  useEffect(() => {
    if (navigationType !== "POP") {
      window.scrollTo(0, 0);
    }
  }, [pathname, navigationType]);

  return null;
}
