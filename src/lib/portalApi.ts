import { portalSupabase } from "./portalSupabase";
import { compressImageFile, randomImageFilename } from "./imageUpload";

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
}

export interface PortalQuoteSection {
  id: string;
  name: string;
  is_optional: boolean;
  sort_order: number;
  items: PortalQuoteItem[];
}

export interface PortalQuote {
  id: string;
  status: "sent" | "approved" | "declined";
  deposit_percentage: number;
  signed_at: string | null;
  signed_by: string | null;
  declined_at: string | null;
  decline_comment: string | null;
  sections: PortalQuoteSection[];
}

export interface PortalChangeOrderItem {
  id: string;
  name: string;
  description: string | null;
  price: number;
  quantity: number;
  unit: string | null;
}

export interface PortalChangeOrderSection {
  id: string;
  name: string;
  sort_order: number;
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
  sections: PortalChangeOrderSection[];
}

export interface PortalInvoice {
  id: string;
  invoice_number: string | null;
  amount: number;
  status: "sent" | "paid" | "overdue";
  due_date: string | null;
  paid_at: string | null;
  created_at: string;
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
    scheduled_start_date: string | null;
    scheduled_end_date: string | null;
    actual_start_date: string | null;
    actual_end_date: string | null;
  };
  business: {
    company_name: string | null;
    phone: string | null;
    email: string | null;
    logo_url: string | null;
  };
  quotes: PortalQuote[];
  change_orders: PortalChangeOrder[];
  invoices: PortalInvoice[];
  photos: PortalPhoto[];
  deliveries: PortalDelivery[];
  events: PortalEvent[];
}

/** The hub's one call for everything a project overview needs — null if
 * the project isn't reachable from the signed-in session (never distinct
 * from "doesn't exist", by design — see migration 0064's doc comment). */
export async function getPortalProjectDetail(projectId: string): Promise<PortalProjectDetail | null> {
  const { data, error } = await portalSupabase.rpc("get_portal_project", { p_project_id: projectId });
  if (error) throw error;
  return (data as PortalProjectDetail | null) ?? null;
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
