import { useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { listClients, createClient, findPossibleDuplicates, type Client } from "@/lib/api";

/** State for the shared ClientCombobox (src/components/common/ClientPicker.tsx). */
export interface NewClientDraft {
  name: string;
  phone: string;
  email: string;
  address: string;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Only Name is required, plus at least one way to reach them. */
export function newClientDraftError(draft: NewClientDraft): string | null {
  if (!draft.name.trim()) return "Add the client's name.";
  if (!draft.phone.trim() && !draft.email.trim()) return "Add a phone number or email.";
  if (draft.email.trim() && !EMAIL_RE.test(draft.email.trim())) return "That email doesn't look right.";
  return null;
}

/** Same phone or email only — a shared name alone is too weak to interrupt a save. */
function findContactDuplicate(draft: NewClientDraft, clients: Client[]): Client | null {
  const found = findPossibleDuplicates({ email: draft.email, phone: draft.phone }, clients);
  return found.find((d) => d.reason === "phone" || d.reason === "email")?.client ?? null;
}

export function useClientField(initialClientId: string | null = null) {
  const qc = useQueryClient();
  const { data: clients = [] } = useQuery({ queryKey: ["clients"], queryFn: listClients });

  const [clientId, setClientIdState] = useState<string | null>(initialClientId);
  const [draft, setDraftState] = useState<NewClientDraft | null>(null);
  const [duplicate, setDuplicate] = useState<Client | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Set by "Create anyway" and read by the very next ensureClient(), which
  // runs in the same tick — a ref, so it isn't a render behind.
  const forceCreate = useRef(false);

  const selectedClient = clients.find((c) => c.id === clientId) ?? null;
  const draftError = draft ? newClientDraftError(draft) : null;

  const clearWarnings = () => {
    setDuplicate(null);
    setError(null);
    forceCreate.current = false;
  };

  const setClientId = (id: string | null) => {
    setClientIdState(id);
    setDraftState(null);
    clearWarnings();
  };

  const setDraft = (next: NewClientDraft | null) => {
    setDraftState(next);
    if (next) setClientIdState(null);
    clearWarnings();
  };

  const reset = (id: string | null = initialClientId) => setClientId(id);

  /**
   * Resolves the client for the caller's submit:
   * - an existing pick → its id
   * - a new-client draft → creates it (after the duplicate check) → its id
   * - nothing → null
   * Returns `undefined` when the submit must stop: the draft is invalid, a
   * likely duplicate was found (the prompt is now showing), or the insert
   * failed (the error is now showing inline).
   */
  const ensureClient = async (): Promise<string | null | undefined> => {
    if (clientId) return clientId;
    if (!draft) return null;
    if (draftError) {
      setError(draftError);
      return undefined;
    }
    if (!forceCreate.current) {
      const dup = findContactDuplicate(draft, clients);
      if (dup) {
        setDuplicate(dup);
        return undefined;
      }
    }
    try {
      const client = await createClient({
        name: draft.name.trim(),
        email: draft.email.trim(),
        phone: draft.phone.trim(),
        address: draft.address.trim(),
      });
      // Seed the cache so the chip (and anything keyed on the selected
      // client) resolves immediately, before the refetch lands.
      qc.setQueryData<Client[]>(["clients"], (old) => (old ? [...old, client] : [client]));
      qc.invalidateQueries({ queryKey: ["clients"] });
      // Swap the draft for the real client, so a retry after a later failure
      // (e.g. the opportunity insert) doesn't create the client twice.
      setClientId(client.id);
      return client.id;
    } catch (err) {
      setError(`Couldn't create the client: ${(err as Error).message}`);
      return undefined;
    }
  };

  return {
    clients,
    clientId,
    setClientId,
    selectedClient,
    draft,
    setDraft,
    draftError,
    duplicate,
    error,
    reset,
    ensureClient,
    /** True once there's something to submit: a pick, or a valid draft. */
    hasClient: !!clientId || (!!draft && !draftError),
    /** Selected client's address, or the draft's — for job-site prefill. */
    address: selectedClient ? selectedClient.address ?? "" : draft ? draft.address : null,
    pickExisting: (client: Client) => setClientId(client.id),
    /** Duplicate prompt's "Create anyway" — the caller re-submits right after. */
    acceptDuplicate: () => {
      setDuplicate(null);
      forceCreate.current = true;
    },
  };
}

export type ClientField = ReturnType<typeof useClientField>;
