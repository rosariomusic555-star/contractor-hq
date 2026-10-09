import { createContext } from "react";

/** True inside the simplified Dashboard: every card header link reads
 *  "… →" ("View all →", "Business health →") so they all match. */
export const SimpleCardsContext = createContext(false);
