import { NextRequest, NextResponse } from "next/server";

import { multiGetObjectsResilient } from "@/lib/sui/rpc-resilient";
import { parseShareInvitation } from "@/lib/sui/share-invitations";

export async function GET(request: NextRequest) {
  const invitationId = request.nextUrl.searchParams.get("invitationId")?.trim();
  if (!invitationId) {
    return NextResponse.json({ error: "invitationId is required." }, { status: 400 });
  }

  try {
    const [response] = await multiGetObjectsResilient([invitationId], { showContent: true });
    const content = response?.data?.content as Record<string, unknown> | undefined;
    if (!content || content.dataType !== "moveObject") {
      return NextResponse.json({ fileObjectId: null });
    }
    const parsed = parseShareInvitation(content, invitationId);
    return NextResponse.json({
      fileObjectId: parsed?.fileObjectId ?? null,
      blobId: parsed?.blobId ?? null,
      sender: parsed?.sender ?? null,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Lookup failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
