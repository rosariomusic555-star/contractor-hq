import { portalSupabase } from "./portalSupabase";
import { compressImageFile, randomImageFilename } from "./imageUpload";
import { clientSafeProjectDetail } from "./clientSafe";

const IMAGES_BUCKET = "images";

export interface PortalProject {
  id: string;
  name: string;
  status: string;
}

export interface PortalClientContext {
  client_id: string;
  client_name: string;
  business_name: string | null;
  projects: PortalProject[];
}

/**
 * Requests a magic-link sign-in email, routed through the
 * portal-request-link Edge Function so an email that doesn't match any
 * client is indistinguishable from one that does — the function always
 * resolves the same way regardless (see its own doc comment). There is
 * deliberately no "email not found" error to surface here.
 */
export async function requestPortalLink(email: string): Promise<void> {
  const redirectTo = `${window.location.origin}/portal`;
  const { error } = await portalSupabase.functions.invoke("portal-request-link", {
    body: { email, redirectTo },
  });
  if (error) throw error;
}

/**
 * Every client record (across every contractor) whose email matches the
 * signed-in portal session, each with its own projects — the hub's
 * landing/picker screen reads this once per session to decide where to
 * send the client.
 */
export async function getPortalContext(): Promise<PortalClientContext[]> {
  const { data, error } = await portalSupabase.rpc("get_portal_context");
  if (error) throw error;
  return (data as PortalClientContext[]) ?? [];
}

/**
 * Best-effort — stamps portal_last_sign_in_at on every client row matching
 * the session's email. Called once after a session is established;
 * failure here should never block the client from using the hub.
 */
export async function recordPortalSignIn(): Promise<void> {
  try {
    await portalSupabase.rpc("record_portal_sign_in");
  } catch {
    // best-effort, see doc comment above
  }
}

/**
 * Contractor-initiated invite ("Invite to client hub" / "Resend link") —
 * sends the same magic link a client would request themselves, through the
 * portal's own Supabase client so it never touches the contractor's own
 * session. Unlike requestPortalLink(), this skips the match-check gate
 * entirely: it's only ever called from an authenticated contractor page
 * that already knows the client is real.
 */
export async function inviteClientToHub(email: string): Promise<void> {
  const redirectTo = `${window.location.origin}/portal`;
  const { error } = await portalSupabase.auth.signInWithOtp({
    email,
    options: { shouldCreateUser: true, emailRedirectTo: redirectTo },
  });
  if (error) throw error;
}

// ---------------------------------------------------------------------------
// Phase 2 — project overview (read-only). One RPC, get_portal_project(),
// is the entire data surface; everything below just shapes/fetches it.
// ---------------------------------------------------------------------------

export interface PortalQuoteItem {
  id: string;
  name: string;
  description: string | null;
  price: number;
  quantity: number;
  unit: string | null;
  is_optional: boolean;
  client_selected: boolean;
  sort_order?: number;
  images?: PortalImageRef[];
}

export interface PortalImageRef {
  id: string;
  storage_path: string;
}

/** A signature / decision record on a quote or change order (0113). */
export interface PortalApproval {
  name?: string | null;
  at?: string | null;
  ip?: string | null;
  comment?: string | null;
}

export interface PortalQuoteSection {
  id: string;
  name: string;
  is_optional: boolean;
  sort_order: number;
  items: PortalQuoteItem[];
  /** Client Selections (0115). */
  selections?: PortalSelectionGroup[];
}

export interface PortalSelectionOption {
  id: string;
  name: string;
  description: string | null;
  image_path: string | null;
  price_delta: number;
  is_default: boolean;
}

export interface PortalSelectionGroup {
  id: string;
  name: string;
  help_text: string | null;
  required: boolean;
  multi: boolean;
  approved_at: string | null;
  options: PortalSelectionOption[];
  picked: string[];
  history: { source: "original" | "change_order"; option_names: string[]; created_at: string; change_order_number: number | null }[];
}

export interface PortalQuote {
  id: string;
  status: "sent" | "approved" | "declined";
  /** 'addon' = new features added to the job (0108), numbered per project. */
  kind?: "original" | "addon";
  addon_number?: number | null;
  deposit_percentage: number;
  signed_at: string | null;
  signed_by: string | null;
  declined_at: string | null;
  decline_comment: string | null;
  /** 0113 — client-facing notes / terms, dates, committed total, approval. */
  notes?: string | null;
  terms?: string | null;
  created_at?: string;
  updated_at?: string;
  total?: number;
  approval?: PortalApproval | null;
  sections: PortalQuoteSection[];
}

export interface PortalChangeOrderItem {
  id: string;
  name: string;
  description: string | null;
  price: number;
  quantity: number;
  unit: string | null;
  sort_order?: number;
  images?: PortalImageRef[];
}

export interface PortalChangeOrderSection {
  id: string;
  name: string;
  sort_order: number;
  /** The scope / measurement change on this feature (0107). */
  scope_note?: string | null;
  items: PortalChangeOrderItem[];
}

export interface PortalChangeOrder {
  id: string;
  title: string;
  description: string | null;
  reason: string | null;
  amount: number;
  /** Never "draft" — get_portal_project() excludes un-sent change orders
   * from the client's view entirely, same rule quotes already follow. */
  status: "sent" | "approved" | "declined";
  schedule_impact_days: number | null;
  approved_at: string | null;
  approved_by: string | null;
  declined_at: string | null;
  decline_comment: string | null;
  created_at: string;
  /** "CO #n" within the project (0108). */
  number?: number;
  signed_at?: string | null;
  signed_by?: string | null;
  total?: number;
  approval?: PortalApproval | null;
  sections: PortalChangeOrderSection[];
}

/** "Add-on quote #2" / "Quote". */
export const portalQuoteLabel = (q: Pick<PortalQuote, "kind" | "addon_number">) =>
  q.kind === "addon" ? `Add-on quote${q.addon_number ? ` #${q.addon_number}` : ""}` : "Quote";

/** "Change order #3" / "Change order". */
export const portalChangeOrderLabel = (c: Pick<PortalChangeOrder, "number">) => `Change order${c.number ? ` #${c.number}` : ""}`;

export interface PortalInvoice {
  id: string;
  invoice_number: string | null;
  amount: number;
  status: "sent" | "paid" | "overdue";
  due_date: string | null;
  paid_at: string | null;
  /** Applied payments (0111) — > 0 and not paid = partially paid. */
  amount_paid?: number;
  created_at: string;
  updated_at?: string;
  notes?: string | null;
  total?: number;
  items?: { description: string; quantity: number; unit_price: number }[];
}

/** A payment as the client sees it (0113) — no internal note. */
export interface PortalPayment {
  /** The receipt's share token — /receipt/:token. */
  token: string;
  receipt_number: string | null;
  amount: number;
  paid_on: string;
  method: string;
  reference: string | null;
  status: "active" | "void";
  voided_at: string | null;
  created_at: string;
  applied_to: { invoice_id: string; invoice_number: string | null; amount: number }[];
}

export type PortalDocType = "quote" | "change_order" | "invoice";

/** An immutable snapshot of a document as it was sent / approved (0113). */
export interface PortalVersion {
  doc_type: PortalDocType;
  doc_id: string;
  version: number;
  state: "sent" | "approved" | "declined" | "issued";
  event: string;
  total: number | null;
  approval: PortalApproval | null;
  created_at: string;
  decided_at: string | null;
  /** Same shape as the live PortalQuote / PortalChangeOrder / PortalInvoice. */
  content: PortalQuote | PortalChangeOrder | PortalInvoice;
}

/** Project money for the client (0111) — contract, paid to date, receipts.
 * Null while the project is still being estimated. */
export interface PortalMoney {
  contract_value: number;
  received: number;
  receipts: { number: string | null; amount: number; paid_on: string; token: string }[];
}

export interface PortalPhoto {
  id: string;
  storage_path: string;
  caption: string | null;
}

export interface PortalDeliveryPhoto {
  id: string;
  storage_path: string;
  caption: string | null;
}

export interface PortalDelivery {
  id: string;
  supplier: string | null;
  expected_delivery_date: string | null;
  status: "ordered" | "delivered" | "delayed";
  photos: PortalDeliveryPhoto[];
}

export interface PortalEvent {
  id: string;
  kind: string;
  summary: string;
  created_at: string;
}

export interface PortalProjectDetail {
  project: {
    id: string;
    name: string;
    status: string;
    address?: string | null;
    scheduled_start_date: string | null;
    scheduled_end_date: string | null;
    actual_start_date: string | null;
    actual_end_date: string | null;
  };
  business: {
    company_name: string | null;
    phone: string | null;
    email: string | null;
    address?: string | null;
    license?: string | null;
    logo_url: string | null;
  };
  client?: { name: string } | null;
  quotes: PortalQuote[];
  change_orders: PortalChangeOrder[];
  invoices: PortalInvoice[];
  money?: PortalMoney | null;
  /** 0113 — every payment (void ones too, labeled) and every version. */
  payments?: PortalPayment[];
  versions?: PortalVersion[];
  photos: PortalPhoto[];
  deliveries: PortalDelivery[];
  events: PortalEvent[];
  /** 0121 — schedule changes posted to the Hub, newest first. Dates and a
   * generic reason only. */
  schedule_updates?: PortalScheduleUpdate[];
  /** 0122 — completed projects: the tracked review link (a path, /r/{token}). */
  review?: { link_path: string } | null;
  /** 0126 — shared progress updates, milestone presets, before/after pairs. */
  progress?: PortalProgress | null;
  /** 0127 — completed projects: care & maintenance (no prices). */
  care?: PortalCare | null;
}

export interface PortalCare {
  items: { label: string; description: string | null; as_needed: boolean; next_month: string | null; feature: string | null }[];
  warranties: { feature: string; ends_on: string }[];
  opted_out: boolean;
}

export interface PortalProgressUpdate {
  id: string;
  date: string;
  text: string | null;
  milestone: string | null;
  /** The project feature's id (the tracker / before-after key). */
  feature: string | null;
  photos: string[];
  liked: boolean;
  comments: { author: "client" | "contractor"; name: string | null; body: string; created_at: string }[];
}

export interface PortalProgress {
  updates: PortalProgressUpdate[];
  features: { id: string; label: string; category: string | null; milestones?: string[] | null }[];
  milestone_presets: Record<string, string[]>;
  before_after: { feature: string | null; before: string; after: string }[];
  marketing_ok: boolean | null;
}

export interface PortalScheduleUpdate {
  id: string;
  posted_at: string;
  reason: "rain" | "weather" | "schedule";
  from_start: string | null;
  from_end: string | null;
  to_start: string | null;
  to_end: string | null;
}

/** The hub's one call for everything a project overview needs — null if
 * the project isn't reachable from the signed-in session (never distinct
 * from "doesn't exist", by design — see migration 0064's doc comment). */
export async function getPortalProjectDetail(projectId: string): Promise<PortalProjectDetail | null> {
  const { data, error } = await portalSupabase.rpc("get_portal_project", { p_project_id: projectId });
  if (error) throw error;
  return data ? clientSafeProjectDetail(data as PortalProjectDetail) : null;
}

/** Signed URLs for photo storage_paths — same shape as api.ts's
 * getSignedImageUrls, but through the portal's own client/session, since
 * Storage RLS for client-visible photos is scoped to a portal identity,
 * not the contractor's. */
export async function getPortalSignedImageUrls(paths: string[]): Promise<Record<string, string>> {
  if (paths.length === 0) return {};
  const { data, error } = await portalSupabase.storage.from(IMAGES_BUCKET).createSignedUrls(paths, 3600);
  if (error) throw error;
  const urls: Record<string, string> = {};
  for (const row of data ?? []) {
    if (row.signedUrl && row.path) urls[row.path] = row.signedUrl;
  }
  return urls;
}

// ---------------------------------------------------------------------------
// Phase 3 — approvals. Every write is a SECURITY DEFINER RPC scoped to the
// caller's own session email (migration 0065) — a quote/change-order id
// alone is never enough to touch anything that isn't actually the client's.
// ---------------------------------------------------------------------------

export async function setPortalQuoteItemSelected(quoteItemId: string, selected: boolean): Promise<void> {
  const { error } = await portalSupabase.rpc("portal_set_quote_item_selection", {
    p_quote_item_id: quoteItemId,
    p_selected: selected,
  });
  if (error) throw error;
}

export async function approvePortalQuote(quoteId: string, signedBy: string): Promise<void> {
  const { error } = await portalSupabase.rpc("portal_approve_quote", { p_quote_id: quoteId, p_signed_by: signedBy });
  if (error) throw error;
}

export async function declinePortalQuote(quoteId: string, comment: string): Promise<void> {
  const { error } = await portalSupabase.rpc("portal_decline_quote", { p_quote_id: quoteId, p_comment: comment });
  if (error) throw error;
}

export async function approvePortalChangeOrder(changeOrderId: string, signedBy: string): Promise<void> {
  const { error } = await portalSupabase.rpc("portal_approve_change_order", {
    p_change_order_id: changeOrderId,
    p_signed_by: signedBy,
  });
  if (error) throw error;
}

export async function declinePortalChangeOrder(changeOrderId: string, comment: string): Promise<void> {
  const { error } = await portalSupabase.rpc("portal_decline_change_order", {
    p_change_order_id: changeOrderId,
    p_comment: comment,
  });
  if (error) throw error;
}

// ---------------------------------------------------------------------------
// Phase 5 — messaging + client photo uploads (migration 0067). Same
// SECURITY DEFINER RPC shape as Phase 3: every read/write is scoped to the
// caller's own session email, never a client-supplied project id alone.
// ---------------------------------------------------------------------------

export interface PortalMessage {
  id: string;
  sender: "contractor" | "client";
  body: string | null;
  image_paths: string[];
  created_at: string;
}

export async function getPortalMessages(projectId: string): Promise<PortalMessage[]> {
  const { data, error } = await portalSupabase.rpc("get_portal_messages", { p_project_id: projectId });
  if (error) throw error;
  return (data as PortalMessage[]) ?? [];
}

/** Uploads any attached photos to the project-messages/ Storage prefix,
 * then calls portal_send_message() — mirrors sendProjectMessage()'s shape
 * in api.ts, but through the portal client/session and RPC. */
export async function sendPortalMessage(projectId: string, body: string, files: File[]): Promise<void> {
  const imagePaths: string[] = [];
  for (const file of files) {
    const compressed = await compressImageFile(file);
    const path = `project-messages/${projectId}/${randomImageFilename(file.name)}`;
    const { error: uploadError } = await portalSupabase.storage
      .from(IMAGES_BUCKET)
      .upload(path, compressed, { contentType: "image/jpeg", upsert: false });
    if (uploadError) throw uploadError;
    imagePaths.push(path);
  }

  const { error } = await portalSupabase.rpc("portal_send_message", {
    p_project_id: projectId,
    p_body: body,
    p_image_paths: imagePaths,
  });
  if (error) throw error;
}

/** Client-submitted photo — lands in the same project_images table the
 * contractor's own gallery reads, but hidden (accepted=false) until the
 * contractor explicitly accepts it (see PhotoGallery.tsx's "From client"
 * section). Never auto-published, per spec. */
export async function uploadPortalProjectImage(
  projectId: string,
  file: File,
  caption: string,
): Promise<void> {
  const compressed = await compressImageFile(file);
  const path = `projects/${projectId}/${randomImageFilename(file.name)}`;
  const { error: uploadError } = await portalSupabase.storage
    .from(IMAGES_BUCKET)
    .upload(path, compressed, { contentType: "image/jpeg", upsert: false });
  if (uploadError) throw uploadError;

  const { error } = await portalSupabase.rpc("portal_add_project_image", {
    p_project_id: projectId,
    p_storage_path: path,
    p_caption: caption,
  });
  if (error) throw error;
}

/** Client Selections (0115): save the client's picks for a group (draft —
 * only while the quote is waiting for approval). */
export async function setPortalSelection(groupId: string, optionIds: string[]): Promise<void> {
  const { error } = await portalSupabase.rpc("portal_set_quote_selection", { p_group_id: groupId, p_option_ids: optionIds });
  if (error) throw error;
}

/** "Request a change" on an approved selection — a request to the
 * contractor; nothing changes until they send a change order. */
export async function requestPortalSelectionChange(groupId: string, optionId: string | null, note: string): Promise<void> {
  const { error } = await portalSupabase.rpc("portal_request_selection_change", { p_group_id: groupId, p_option_id: optionId, p_note: note });
  if (error) throw error;
}

/** Quote activity (0117): a heartbeat while the client has a quote open in
 * the Hub. Internal only; the server ignores the contractor's own team. */
export async function trackPortalQuoteView(quoteId: string, sessionKey: string, device: string, activeSeconds: number, sections: string[]): Promise<void> {
  await portalSupabase.rpc("track_portal_quote_view", { p_quote_id: quoteId, p_session_key: sessionKey, p_device: device, p_active_seconds: activeSeconds, p_sections: sections });
}

export async function trackPortalQuoteEvent(quoteId: string, sessionKey: string, kind: "pdf_downloaded" | "optional_changed", detail: Record<string, unknown> = {}): Promise<void> {
  await portalSupabase.rpc("track_quote_event", { p_quote_id: quoteId, p_token: null, p_session_key: sessionKey, p_kind: kind, p_detail: detail });
}

// Progress updates (0126) — the client's reactions, comments, marketing consent.
export async function portalReactProgress(updateId: string, on: boolean): Promise<void> {
  const { error } = await portalSupabase.rpc("portal_react_progress", { p_update_id: updateId, p_on: on });
  if (error) throw error;
}
export async function portalCommentProgress(updateId: string, body: string): Promise<void> {
  const { error } = await portalSupabase.rpc("portal_comment_progress", { p_update_id: updateId, p_body: body });
  if (error) throw error;
}
export async function portalSetMarketingOk(projectId: string, ok: boolean): Promise<void> {
  const { error } = await portalSupabase.rpc("portal_set_marketing_ok", { p_project_id: projectId, p_ok: ok });
  if (error) throw error;
}

// Maintenance (0127) — "Request service" and "Don't remind me".
export async function portalRequestService(projectId: string): Promise<void> {
  const { error } = await portalSupabase.rpc("portal_request_service", { p_project_id: projectId });
  if (error) throw error;
}
export async function portalMaintenanceOptOut(projectId: string, optOut: boolean): Promise<void> {
  const { error } = await portalSupabase.rpc("portal_maintenance_opt_out", { p_project_id: projectId, p_opt_out: optOut });
  if (error) throw error;
}
