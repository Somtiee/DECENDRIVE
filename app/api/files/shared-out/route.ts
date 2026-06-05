import { NextRequest, NextResponse } from "next/server";



import { paginateSlice, parsePageParams } from "@/lib/drive/pagination";

import type { SharedOutItem } from "@/components/drive/types";

import { getDecendrivePackageIdsForQuery } from "@/lib/sui/contract";
import { multiGetObjectsResilient } from "@/lib/sui/rpc-resilient";

import { collectShareSentDrafts, type ShareSentDraft } from "@/lib/sui/collect-share-sent";

import { parseShareInvitation } from "@/lib/sui/share-invitations";

import { FULL_SHARE_PERMISSION_FLAGS } from "@/lib/sui/share-crypto";
import {
  isShareInvitationRevoked,
  readLiveShareAccessBatch,
  type LiveShareAccess,
} from "@/lib/sui/read-file-metadata";
import type { ShareInvitationRecord } from "@/lib/sui/share-invitations";

const SHARED_OUT_CACHE_TTL_MS = 15_000;
const sharedOutDraftCache = new Map<
  string,
  { expiresAt: number; drafts: ShareSentDraft[] }
>();
const sharedOutEnrichedCache = new Map<
  string,
  { expiresAt: number; items: SharedOutItem[] }
>();

function getCachedDrafts(sender: string) {
  const entry = sharedOutDraftCache.get(sender.toLowerCase());
  if (!entry || entry.expiresAt < Date.now()) {
    return null;
  }
  return entry.drafts;
}

function setCachedDrafts(sender: string, drafts: ShareSentDraft[]) {
  sharedOutDraftCache.set(sender.toLowerCase(), {
    expiresAt: Date.now() + SHARED_OUT_CACHE_TTL_MS,
    drafts,
  });
}

function getCachedSharedOut(sender: string) {
  const entry = sharedOutEnrichedCache.get(sender.toLowerCase());
  if (!entry || entry.expiresAt < Date.now()) {
    return null;
  }
  return entry.items;
}

function setCachedSharedOut(sender: string, items: SharedOutItem[]) {
  sharedOutEnrichedCache.set(sender.toLowerCase(), {
    expiresAt: Date.now() + SHARED_OUT_CACHE_TTL_MS,
    items,
  });
}



async function fetchInvitationObjects(invitationIds: string[]) {
  const { isValidSuiAddress } = await import("@mysten/sui/utils");
  const unique = [...new Set(invitationIds)].filter((id) => isValidSuiAddress(id));
  const objects: Array<{ objectId: string; content: Record<string, unknown> }> = [];

  for (let offset = 0; offset < unique.length; offset += 50) {
    const chunk = unique.slice(offset, offset + 50);
    const response = await multiGetObjectsResilient(chunk, { showContent: true });
    for (const entry of response) {
      const objectId = entry.data?.objectId;
      const content = entry.data?.content as Record<string, unknown> | undefined;
      if (!objectId || !content || content.dataType !== "moveObject") {
        continue;
      }
      objects.push({ objectId, content });
    }
  }

  return objects;
}



function buildSharedOutItems(
  drafts: ShareSentDraft[],
  objects: Array<{ objectId: string; content: Record<string, unknown> }>,
  liveByFileId: Map<string, LiveShareAccess>,
): SharedOutItem[] {
  const invites = new Map<string, ShareInvitationRecord>();

  for (const entry of objects) {
    const parsed = parseShareInvitation(entry.content, entry.objectId);
    if (parsed) {
      invites.set(entry.objectId, parsed);
    }
  }

  return drafts.map((draft) => {
    const invite = invites.get(draft.invitationId);
    const onChain = invite
      ? {
          status: invite.status,
          acceptedAt: invite.acceptedAt,
        }
      : undefined;
    const status = onChain?.status ?? "pending";
    const acceptedAt = onChain?.acceptedAt ?? 0;
    const permissions =
      draft.permissions > 0 ? draft.permissions : FULL_SHARE_PERMISSION_FLAGS;
    const fileObjectId = invite?.fileObjectId;
    const live = fileObjectId ? liveByFileId.get(fileObjectId) : undefined;
    const accessRevoked = isShareInvitationRevoked(live ?? null, draft.invitationId, draft.recipient);

    return {
      invitationId: draft.invitationId,
      blobId: draft.blobId,
      name: invite?.name ?? `Shared file ${draft.blobId.slice(0, 10)}…`,
      recipient: draft.recipient,
      permissions: accessRevoked ? 0 : permissions,
      createdAt: draft.createdAt,
      status,
      acceptedAt,
      txDigest: draft.txDigest,
      accessRevoked,
      fileObjectId,
    };
  });
}

async function enrichShares(drafts: ShareSentDraft[]): Promise<SharedOutItem[]> {
  try {
    const objects = await fetchInvitationObjects(drafts.map((item) => item.invitationId));
    const invites = objects
      .map((entry) => parseShareInvitation(entry.content, entry.objectId))
      .filter((invite): invite is ShareInvitationRecord => Boolean(invite));
    const fileObjectIds = invites
      .map((invite) => invite.fileObjectId)
      .filter((value): value is string => Boolean(value));
    const liveByFileId = await readLiveShareAccessBatch(fileObjectIds);
    return buildSharedOutItems(drafts, objects, liveByFileId);
  } catch {
    return buildSharedOutItems(drafts, [], new Map());
  }
}



export async function GET(request: NextRequest) {

  const sender = request.nextUrl.searchParams.get("sender");

  const { page, pageSize } = parsePageParams(request.nextUrl.searchParams, 10);



  if (!sender) {

    return NextResponse.json({

      items: [],

      pagination: { page: 1, pageSize, total: 0, totalPages: 1 },

    });

  }



  const packageIds = getDecendrivePackageIdsForQuery();

  if (packageIds.length === 0) {

    return NextResponse.json({

      items: [],

      pagination: { page: 1, pageSize, total: 0, totalPages: 1 },

    });

  }



  const refresh = request.nextUrl.searchParams.get("refresh") === "1";
  const senderKey = sender.toLowerCase();
  if (refresh) {
    sharedOutDraftCache.delete(senderKey);
    sharedOutEnrichedCache.delete(senderKey);
  }

  try {
    let drafts = refresh ? null : getCachedDrafts(sender);
    if (!drafts) {
      drafts = await collectShareSentDrafts(sender);
      setCachedDrafts(sender, drafts);
    }

    const enriched = await enrichShares(drafts);
    setCachedSharedOut(sender, enriched);
    return NextResponse.json(paginateSlice(enriched, page, pageSize));
  } catch (error) {
    if (!refresh) {
      const stale = getCachedSharedOut(sender);
      if (stale && stale.length > 0) {
        return NextResponse.json({
          ...paginateSlice(stale, page, pageSize),
          stale: true,
          warning: "Showing your last loaded shares — Sui RPC is busy. Tap Refresh in a moment.",
        });
      }
    }

    const message = error instanceof Error ? error.message : "Failed to load shared files.";
    return NextResponse.json(
      {
        items: [],
        pagination: { page: 1, pageSize, total: 0, totalPages: 1 },
        error: message,
      },
      { status: 503 },
    );
  }
}


