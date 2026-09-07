/**
 * Back-compat shim. Project status presentation now lives in `./statusMeta`
 * alongside quote / invoice status. Import from there in new code.
 */
export {
  PROJECT_STATUS_META,
  PROJECT_STATUSES,
  projectStatusMeta,
  type StatusMeta,
} from "./statusMeta";
