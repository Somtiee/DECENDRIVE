import { NextRequest, NextResponse } from "next/server";



import { normalizePageSize, paginateSlice, parsePageParams } from "@/lib/drive/pagination";

import { getDecendrivePackageIdsForQuery } from "@/lib/sui/contract";

import { fetchShareInvitationsForRecipient } from "@/lib/sui/fetch-share-invitations";

import {
  isShareInvitationRevoked,
  readLiveShareAccessBatch,
} from "@/lib/sui/read-file-metadata";

import { FULL_SHARE_PERMISSION_FLAGS } from "@/lib/sui/share-crypto";

import type { ShareInvitationRecord } from "@/lib/sui/share-invitations";



function toInvitationView(invite: ShareInvitationRecord) {

  return {

    objectId: invite.objectId,

    blobId: invite.blobId,

    sender: invite.sender,

    recipient: invite.recipient,

    name: invite.name,

    mimeType: invite.mimeType,

    size: invite.size,

    encryptionKeyHash: invite.encryptionKeyHash,

    keyWrapper: invite.keyWrapper,

    permissions: invite.permissions,

    canView: invite.canView,

    canDownload: invite.canDownload,

    accessRevoked: invite.accessRevoked,

    expiresAt: invite.expiresAt,

    status: invite.status,

    createdAt: invite.createdAt,

    acceptedAt: invite.acceptedAt,

    walrusObjectId: invite.walrusObjectId,

    fileObjectId: invite.fileObjectId,

    walrusUrl: invite.walrusUrl,

    date: invite.date,

  };

}



const emptyPage = (pageSize: number) => ({

  items: [],

  pagination: { page: 1, pageSize, total: 0, totalPages: 1 },

});



const CACHE_TTL_MS = 12_000;

const invitationCache = new Map<

  string,

  { expiresAt: number; invitations: ShareInvitationRecord[] }

>();

const enrichedCache = new Map<

  string,

  { expiresAt: number; invitations: ShareInvitationRecord[] }

>();



function getCachedInvitations(recipient: string) {

  const entry = invitationCache.get(recipient.toLowerCase());

  if (!entry || entry.expiresAt < Date.now()) {

    return null;

  }

  return entry.invitations;

}



function getCachedEnrichedInvitations(recipient: string) {

  const entry = enrichedCache.get(recipient.toLowerCase());

  if (!entry || entry.expiresAt < Date.now()) {

    return null;

  }

  return entry.invitations;

}



function enrichPendingInvitation(invite: ShareInvitationRecord): ShareInvitationRecord {
  const permissions =
    invite.permissions > 0 ? invite.permissions : FULL_SHARE_PERMISSION_FLAGS;
  return {
    ...invite,
    canView: invite.canView || permissions > 0,
    canDownload: invite.canDownload || (permissions & 2) !== 0,
    accessRevoked: false,
    permissions,
  };
}

async function enrichInvitations(

  invitations: ShareInvitationRecord[],

  recipient: string,

): Promise<ShareInvitationRecord[]> {

  const pending = invitations
    .filter((invite) => invite.status === "pending")
    .map(enrichPendingInvitation);

  const settled = invitations.filter((invite) => invite.status !== "pending");
  if (settled.length === 0) {
    return pending;
  }

  const fileObjectIds = settled

    .map((invite) => invite.fileObjectId)

    .filter((value): value is string => Boolean(value));

  const liveByFileId = await readLiveShareAccessBatch(fileObjectIds, recipient);

  const enrichedSettled: ShareInvitationRecord[] = [];

  for (const invite of settled) {

    const fileObjectId = invite.fileObjectId;

    const live = fileObjectId ? liveByFileId.get(fileObjectId) : null;
    const revoked = isShareInvitationRevoked(live ?? null, invite.objectId, recipient);

    if (!live) {

      const permissions = revoked

        ? 0

        : invite.permissions > 0

          ? invite.permissions

          : FULL_SHARE_PERMISSION_FLAGS;

      enrichedSettled.push({

        ...invite,

        canView: revoked ? false : invite.canView || permissions > 0,

        canDownload: revoked ? false : invite.canDownload || (permissions & 2) !== 0,

        accessRevoked: revoked,

        permissions,

        fileObjectId,

      });

      continue;

    }

    const permissions = revoked

      ? 0

      : invite.permissions > 0

        ? invite.permissions

        : FULL_SHARE_PERMISSION_FLAGS;

    enrichedSettled.push({

      ...invite,

      canView: revoked ? false : invite.canView || permissions > 0,

      canDownload: revoked ? false : invite.canDownload || (permissions & 2) !== 0,

      accessRevoked: revoked,

      permissions,

      fileObjectId,

    });

  }

  return [...pending, ...enrichedSettled];

}



function setCachedInvitations(recipient: string, invitations: ShareInvitationRecord[]) {

  invitationCache.set(recipient.toLowerCase(), {

    expiresAt: Date.now() + CACHE_TTL_MS,

    invitations,

  });

}



function setCachedEnrichedInvitations(recipient: string, invitations: ShareInvitationRecord[]) {

  enrichedCache.set(recipient.toLowerCase(), {

    expiresAt: Date.now() + CACHE_TTL_MS,

    invitations,

  });

}



export async function GET(request: NextRequest) {

  const recipient = request.nextUrl.searchParams.get("recipient")?.trim();

  const statusFilter = request.nextUrl.searchParams.get("status") ?? "all";

  const refresh = request.nextUrl.searchParams.get("refresh") === "1";

  const pendingPage = Math.max(1, Number(request.nextUrl.searchParams.get("pendingPage") ?? "1") || 1);

  const receivedPage = Math.max(1, Number(request.nextUrl.searchParams.get("receivedPage") ?? "1") || 1);

  const pageSize = normalizePageSize(Number(request.nextUrl.searchParams.get("pageSize") ?? "10") || 10);



  if (!recipient) {

    return NextResponse.json({

      pending: emptyPage(pageSize),

      received: emptyPage(pageSize),

    });

  }



  const packageIds = getDecendrivePackageIdsForQuery();

  if (packageIds.length === 0) {

    return NextResponse.json({

      pending: emptyPage(pageSize),

      received: emptyPage(pageSize),

      error: "Contract package ID is not configured.",

    });

  }



  try {

    const recipientKey = recipient.toLowerCase();

    if (refresh) {

      invitationCache.delete(recipientKey);

      enrichedCache.delete(recipientKey);

    }



    if (!refresh) {

      const cachedEnriched = getCachedEnrichedInvitations(recipient);

      if (cachedEnriched) {

        const forRecipient = cachedEnriched.filter(

          (item) =>

            !item.recipient ||

            item.recipient.toLowerCase() === recipientKey,

        );

        const pending = forRecipient

          .filter((item) => item.status === "pending")

          .map(toInvitationView)

          .sort((a, b) => b.createdAt - a.createdAt);

        const received = forRecipient

          .filter((item) => item.status === "accepted")

          .map(toInvitationView)

          .sort((a, b) => (b.acceptedAt || b.createdAt) - (a.acceptedAt || a.createdAt));

        if (statusFilter === "pending") {

          return NextResponse.json({

            pending: paginateSlice(pending, pendingPage, pageSize),

            received: emptyPage(pageSize),

            stale: false,

          });

        }

        if (statusFilter === "received") {

          return NextResponse.json({

            pending: emptyPage(pageSize),

            received: paginateSlice(received, receivedPage, pageSize),

            stale: false,

          });

        }

        return NextResponse.json({

          pending: paginateSlice(pending, pendingPage, pageSize),

          received: paginateSlice(received, receivedPage, pageSize),

          stale: false,

        });

      }

    }



    let rawInvitations = refresh ? null : getCachedInvitations(recipient);

    if (!rawInvitations) {

      rawInvitations = await fetchShareInvitationsForRecipient(recipient, packageIds);

      if (rawInvitations.length > 0) {

        setCachedInvitations(recipient, rawInvitations);

      }

    }

    const invitations = await enrichInvitations(rawInvitations ?? [], recipient);

    if (invitations.length > 0) {

      setCachedEnrichedInvitations(recipient, invitations);

    }

    const forRecipient = invitations.filter(

      (item) =>

        !item.recipient ||

        item.recipient.toLowerCase() === recipient.toLowerCase(),

    );



    const pending = forRecipient

      .filter((item) => item.status === "pending")

      .map(toInvitationView)

      .sort((a, b) => b.createdAt - a.createdAt);

    const received = forRecipient

      .filter((item) => item.status === "accepted")

      .map(toInvitationView)

      .sort((a, b) => (b.acceptedAt || b.createdAt) - (a.acceptedAt || a.createdAt));



    if (statusFilter === "pending") {

      return NextResponse.json({

        pending: paginateSlice(pending, pendingPage, pageSize),

        received: emptyPage(pageSize),

      });

    }



    if (statusFilter === "received") {

      return NextResponse.json({

        pending: emptyPage(pageSize),

        received: paginateSlice(received, receivedPage, pageSize),

      });

    }



    return NextResponse.json({

      pending: paginateSlice(pending, pendingPage, pageSize),

      received: paginateSlice(received, receivedPage, pageSize),

      stale: false,

    });

  } catch (error) {

    const message = error instanceof Error ? error.message : "Failed to load share invitations.";

    console.error("[received]", recipient, message);



    const cached = getCachedEnrichedInvitations(recipient) ?? getCachedInvitations(recipient);

    if (cached) {

      let enrichedCached = cached;

      if (!getCachedEnrichedInvitations(recipient)) {

        try {

          enrichedCached = await enrichInvitations(cached, recipient);

        } catch {

          // Keep raw cached rows if live revoke enrichment fails.

        }

      }

      const forRecipient = enrichedCached.filter(

        (item) =>

          !item.recipient ||

          item.recipient.toLowerCase() === recipient.toLowerCase(),

      );

      const pending = forRecipient

        .filter((item) => item.status === "pending")

        .map(toInvitationView)

        .sort((a, b) => b.createdAt - a.createdAt);

      const received = forRecipient

        .filter((item) => item.status === "accepted")

        .map(toInvitationView)

        .sort((a, b) => (b.acceptedAt || b.createdAt) - (a.acceptedAt || a.createdAt));



      return NextResponse.json({

        pending: paginateSlice(pending, pendingPage, pageSize),

        received: paginateSlice(received, receivedPage, pageSize),

        stale: true,

        warning:

          "Showing your last loaded list — Sui RPC is busy. Tap Retry in a moment for a fresh sync.",

      });

    }



    return NextResponse.json(

      {

        pending: emptyPage(pageSize),

        received: emptyPage(pageSize),

        error: message,

      },

      { status: 503 },

    );

  }

}

