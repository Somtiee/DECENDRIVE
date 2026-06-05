import { getDecendrivePackageIdsForQuery } from "@/lib/sui/contract";
import {
  coerceSuiAddress,
  isAnyShareInvitationType,
  packageIdFromStructType,
  parseShareInvitation,
  type ShareInvitationRecord,
} from "@/lib/sui/share-invitations";
import { suiJsonRpc } from "@/lib/sui/rpc-resilient";

type OwnedObjectRow = {
  data?: {
    objectId?: string;
    type?: string;
    content?: Record<string, unknown>;
  };
};

type OwnedObjectsPage = {
  data?: OwnedObjectRow[];
  hasNextPage?: boolean;
  nextCursor?: string | null;
};

type SuiEventRow = {
  parsedJson?: Record<string, unknown>;
};

type QueryEventsResult = {
  data?: SuiEventRow[];
};

const OWNED_PAGE_SIZE = 50;
/** Cap wallet scan — recipient wallets often hold hundreds of unrelated objects. */
const MAX_OWNED_SCAN_PAGES = 8;

function objectTypeName(row: OwnedObjectRow): string {
  return String(row.data?.type ?? row.data?.content?.type ?? "");
}

function parseInvitationRow(
  row: OwnedObjectRow,
  owner: string,
): { invite: ShareInvitationRecord; packageId: string | null } | null {
  const objectId = row.data?.objectId;
  const content = row.data?.content;
  if (!objectId || !content || content.dataType !== "moveObject") {
    return null;
  }
  const typeName = objectTypeName(row);
  if (!isAnyShareInvitationType(typeName)) {
    return null;
  }
  const parsed = parseShareInvitation(content, objectId);
  if (!parsed) {
    return null;
  }
  return {
    invite: {
      ...parsed,
      recipient: parsed.recipient || owner,
    },
    packageId: packageIdFromStructType(typeName),
  };
}

async function loadOwnedInvitationsPage(
  owner: string,
  cursor: string | null | undefined,
  useRpc: boolean,
): Promise<OwnedObjectsPage> {
  if (useRpc) {
    return (
      (await suiJsonRpc<OwnedObjectsPage>("suix_getOwnedObjects", [
        owner,
        { cursor, options: { showContent: true, showType: true }, limit: OWNED_PAGE_SIZE },
      ])) ?? { data: [] }
    );
  }

  const { getSuiClient } = await import("@/lib/sui/client");
  const client = getSuiClient();
  const batch = await client.getOwnedObjects({
    owner,
    cursor,
    options: { showContent: true, showType: true },
    limit: OWNED_PAGE_SIZE,
  });
  return {
    data: batch.data as OwnedObjectRow[],
    hasNextPage: batch.hasNextPage,
    nextCursor: batch.nextCursor ?? null,
  };
}

/** Limited wallet scan — matches ShareInvitation from any DecenDrive package publish. */
async function loadOwnedInvitations(owner: string): Promise<{
  invitations: ShareInvitationRecord[];
  packageIds: string[];
}> {
  const invitations: ShareInvitationRecord[] = [];
  const packageIds = new Set<string>();
  const seen = new Set<string>();
  let cursor: string | null | undefined = null;

  for (let useRpc = 0; useRpc < 2; useRpc += 1) {
    cursor = null;
    invitations.length = 0;
    packageIds.clear();
    seen.clear();

    try {
      for (let page = 0; page < MAX_OWNED_SCAN_PAGES; page += 1) {
        const batch = await loadOwnedInvitationsPage(owner, cursor, useRpc === 1);
        for (const row of batch.data ?? []) {
          const parsed = parseInvitationRow(row, owner);
          if (!parsed || seen.has(parsed.invite.objectId)) {
            continue;
          }
          seen.add(parsed.invite.objectId);
          invitations.push(parsed.invite);
          if (parsed.packageId) {
            packageIds.add(parsed.packageId);
          }
        }
        if (!batch.hasNextPage || !batch.nextCursor) {
          break;
        }
        cursor = batch.nextCursor;
      }
      return { invitations, packageIds: [...packageIds] };
    } catch {
      // Retry via resilient JSON-RPC on the next pass.
    }
  }

  return { invitations, packageIds: [] };
}

async function loadInvitationsByObjectIds(
  invitationIds: string[],
  recipient: string,
  options?: { trustRecipient?: boolean },
): Promise<ShareInvitationRecord[]> {
  const { getSuiClient } = await import("@/lib/sui/client");
  const { isValidSuiAddress } = await import("@mysten/sui/utils");
  const unique = [...new Set(invitationIds)].filter((id) => isValidSuiAddress(id));
  if (unique.length === 0) {
    return [];
  }

  const client = getSuiClient();
  const recipientLower = recipient.toLowerCase();
  const trustRecipient = options?.trustRecipient ?? false;
  const invitations: ShareInvitationRecord[] = [];

  for (let offset = 0; offset < unique.length; offset += 50) {
    const chunk = unique.slice(offset, offset + 50);
    let response;
    try {
      response = await client.multiGetObjects({
        ids: chunk,
        options: { showContent: true, showType: true },
      });
    } catch {
      continue;
    }
    for (const entry of response) {
      const objectId = entry.data?.objectId;
      const content = entry.data?.content as Record<string, unknown> | undefined;
      if (!objectId || !content || content.dataType !== "moveObject") {
        continue;
      }
      const parsed = parseShareInvitation(content, objectId);
      if (!parsed) {
        continue;
      }
      const inviteRecipient = parsed.recipient || recipient;
      if (!trustRecipient && inviteRecipient.toLowerCase() !== recipientLower) {
        continue;
      }
      invitations.push({ ...parsed, recipient: inviteRecipient });
    }
  }
  return invitations;
}

async function queryShareSentEvents(
  packageId: string,
): Promise<SuiEventRow[]> {
  try {
    const { getSuiClient } = await import("@/lib/sui/client");
    const client = getSuiClient();
    const events = await client.queryEvents({
      query: { MoveEventType: `${packageId}::decendrive::ShareSentEvent` },
      limit: 100,
      order: "descending",
    });
    return events.data as SuiEventRow[];
  } catch {
    const rpc = await suiJsonRpc<QueryEventsResult>("suix_queryEvents", [
      {
        query: { MoveEventType: `${packageId}::decendrive::ShareSentEvent` },
        limit: 100,
        order: "descending",
      },
    ]);
    return rpc?.data ?? [];
  }
}

async function loadInvitationsFromShareSentEvents(
  recipient: string,
  packageIds: string[],
): Promise<ShareInvitationRecord[]> {
  const invitationIds: string[] = [];
  const recipientLower = recipient.toLowerCase();

  for (const packageId of packageIds) {
    try {
      const events = await queryShareSentEvents(packageId);
      for (const event of events) {
        const parsed = event.parsedJson;
        if (!parsed) {
          continue;
        }
        const eventRecipient = coerceSuiAddress(parsed.recipient);
        if (eventRecipient.toLowerCase() !== recipientLower) {
          continue;
        }
        const invitationId = String(parsed.invitation_id ?? "");
        if (invitationId) {
          invitationIds.push(invitationId);
        }
      }
    } catch {
      // Try next package ID.
    }
  }

  return loadInvitationsByObjectIds(invitationIds, recipient, { trustRecipient: true });
}

/**
 * Invitations for a recipient.
 * Fast path: ShareSentEvent index + multiGetObjects.
 * Fallback: limited paginated wallet scan (StructType filters miss invites on some RPCs).
 */
export async function fetchShareInvitationsForRecipient(
  recipient: string,
  packageIds: string[],
): Promise<ShareInvitationRecord[]> {
  const configuredIds = packageIds.length > 0 ? packageIds : getDecendrivePackageIdsForQuery();
  const seen = new Set<string>();
  const all: ShareInvitationRecord[] = [];

  const owned = await loadOwnedInvitations(recipient);
  for (const invite of owned.invitations) {
    if (seen.has(invite.objectId)) {
      continue;
    }
    seen.add(invite.objectId);
    all.push(invite);
  }

  const eventPackageIds = [...new Set([...configuredIds, ...owned.packageIds])];
  const fromEvents = await loadInvitationsFromShareSentEvents(recipient, eventPackageIds);
  for (const invite of fromEvents) {
    if (seen.has(invite.objectId)) {
      continue;
    }
    seen.add(invite.objectId);
    all.push(invite);
  }

  return all;
}
