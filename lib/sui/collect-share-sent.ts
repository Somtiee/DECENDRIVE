import "server-only";

import { getDecendrivePackageIdsForQuery } from "@/lib/sui/contract";
import { coerceSuiAddress } from "@/lib/sui/share-invitations";
import { queryEventsResilient, suiJsonRpc } from "@/lib/sui/rpc-resilient";

export type ShareSentDraft = {
  invitationId: string;
  blobId: string;
  recipient: string;
  permissions: number;
  createdAt: number;
  txDigest?: string;
};

const MAX_TX_PAGES = 20;
const TX_PAGE_SIZE = 50;
const MAX_EVENT_PAGES = 20;
const EVENT_PAGE_SIZE = 50;

function parseShareSentEvent(
  parsed: Record<string, unknown> | undefined,
  txDigest: string | undefined,
  senderLower: string,
): ShareSentDraft | null {
  if (!parsed) {
    return null;
  }
  const eventSender = coerceSuiAddress(parsed.sender);
  if (!eventSender || eventSender.toLowerCase() !== senderLower) {
    return null;
  }
  const invitationId = String(parsed.invitation_id ?? "");
  const blobId = String(parsed.blob_id ?? "");
  if (!invitationId || !blobId) {
    return null;
  }
  return {
    invitationId,
    blobId,
    recipient: coerceSuiAddress(parsed.recipient),
    permissions: Number(parsed.permissions ?? 3),
    createdAt: Number(parsed.created_at ?? Date.now()),
    txDigest,
  };
}

function dedupeDrafts(drafts: ShareSentDraft[]): ShareSentDraft[] {
  const map = new Map<string, ShareSentDraft>();
  for (const draft of drafts) {
    const key = draft.invitationId || `${draft.blobId}-${draft.recipient}-${draft.createdAt}`;
    const existing = map.get(key);
    if (!existing || draft.createdAt > existing.createdAt) {
      map.set(key, draft);
    }
  }
  return [...map.values()].sort((a, b) => b.createdAt - a.createdAt);
}

function isConfiguredShareSentEvent(eventType: string | undefined, packageIds: Set<string>) {
  if (!eventType?.includes("ShareSentEvent")) {
    return false;
  }
  if (packageIds.size === 0) {
    return true;
  }
  const packageHint = eventType.split("::")[0]?.toLowerCase();
  return Boolean(packageHint && packageIds.has(packageHint));
}

/** Fast path: events emitted by this wallet (not buried in upload/register txs). */
async function collectShareSentFromSenderEvents(sender: string): Promise<ShareSentDraft[]> {
  const senderLower = sender.toLowerCase();
  const packageIds = new Set(getDecendrivePackageIdsForQuery().map((id) => id.toLowerCase()));
  const drafts: ShareSentDraft[] = [];

  let cursor: string | null = null;
  for (let page = 0; page < MAX_EVENT_PAGES; page++) {
    const result = await queryEventsResilient(
      { Sender: sender },
      { cursor, limit: EVENT_PAGE_SIZE, order: "descending" },
    );

    for (const event of result.data) {
      if (!isConfiguredShareSentEvent(event.type, packageIds)) {
        continue;
      }
      const draft = parseShareSentEvent(event.parsedJson, event.id?.txDigest, senderLower);
      if (draft) {
        drafts.push(draft);
      }
    }
    if (!result.hasNextPage || !result.nextCursor) {
      break;
    }
    cursor = result.nextCursor;
  }

  return dedupeDrafts(drafts);
}

/** Fallback: scan sender txs when event index is incomplete on some RPCs. */
async function collectShareSentFromTransactions(sender: string): Promise<ShareSentDraft[]> {
  const senderLower = sender.toLowerCase();
  const packageIds = new Set(getDecendrivePackageIdsForQuery().map((id) => id.toLowerCase()));
  const drafts: ShareSentDraft[] = [];

  let cursor: string | null = null;
  for (let page = 0; page < MAX_TX_PAGES; page++) {
    type TxPage = {
      data?: Array<{
        digest?: string;
        events?: Array<{ type: string; parsedJson?: Record<string, unknown> }>;
      }>;
      hasNextPage?: boolean;
      nextCursor?: string | null;
    };
    const result: TxPage = await suiJsonRpc<TxPage>("suix_queryTransactionBlocks", [
      {
        filter: { FromAddress: sender },
        cursor,
        options: { showEvents: true },
        limit: TX_PAGE_SIZE,
      },
    ]);

    for (const tx of result?.data ?? []) {
      for (const event of tx.events ?? []) {
        if (!isConfiguredShareSentEvent(event.type, packageIds)) {
          continue;
        }
        const draft = parseShareSentEvent(event.parsedJson, tx.digest, senderLower);
        if (draft) {
          drafts.push(draft);
        }
      }
    }
    if (!result?.hasNextPage || !result.nextCursor) {
      break;
    }
    cursor = result.nextCursor;
  }

  return dedupeDrafts(drafts);
}

/** Collect outgoing share invitations sent by this wallet. */
export async function collectShareSentDrafts(sender: string): Promise<ShareSentDraft[]> {
  const fromEvents = await collectShareSentFromSenderEvents(sender);
  const fromTransactions = await collectShareSentFromTransactions(sender);
  return dedupeDrafts([...fromEvents, ...fromTransactions]);
}
