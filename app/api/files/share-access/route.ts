import { NextRequest, NextResponse } from "next/server";

import {
  isShareInvitationRevoked,
  readLiveShareAccessForBlob,
  readLiveShareAccessForInvitation,
  readLiveShareAccessFromFileObject,
} from "@/lib/sui/read-file-metadata";

export async function GET(request: NextRequest) {
  const sender = request.nextUrl.searchParams.get("sender")?.trim();
  const recipient = request.nextUrl.searchParams.get("recipient")?.trim();
  const blobId = request.nextUrl.searchParams.get("blobId")?.trim();
  const invitationId = request.nextUrl.searchParams.get("invitationId")?.trim();
  const fileObjectId = request.nextUrl.searchParams.get("fileObjectId")?.trim();
  const includeRevokedList = request.nextUrl.searchParams.get("includeRevokedList") === "1";

  try {
    let live = null as Awaited<ReturnType<typeof readLiveShareAccessForInvitation>>;

    if (fileObjectId && invitationId) {
      live = await readLiveShareAccessForInvitation(fileObjectId, invitationId, recipient);
    } else if (fileObjectId) {
      live = await readLiveShareAccessFromFileObject(fileObjectId, recipient);
      if (live && invitationId) {
        live.accessRevoked = isShareInvitationRevoked(live, invitationId, recipient);
      }
    } else if (sender && blobId) {
      live = await readLiveShareAccessForBlob(sender, blobId, recipient, invitationId);
    } else {
      return NextResponse.json({ revoked: false, canView: true, canDownload: true });
    }

    if (!live) {
      return NextResponse.json({ revoked: false, canView: true, canDownload: true });
    }

    const revoked = invitationId
      ? isShareInvitationRevoked(live, invitationId, recipient)
      : live.accessRevoked;

    return NextResponse.json({
      revoked,
      canView: revoked ? false : live.canView,
      canDownload: revoked ? false : live.canDownload,
      ...(includeRevokedList
        ? {
            revokedRecipients: live.revokedRecipients,
            revokedInvitations: live.revokedInvitations,
            revokedInvitationsRaw: live.revokedInvitationsRaw,
            revokedRecipientsRaw: live.revokedRecipientsRaw,
          }
        : {}),
    });
  } catch {
    return NextResponse.json({ revoked: false, canView: true, canDownload: true });
  }
}
