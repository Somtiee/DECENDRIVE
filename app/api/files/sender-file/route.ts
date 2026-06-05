import { NextRequest, NextResponse } from "next/server";

import { findDecenDriveFileForBlob } from "@/lib/sui/find-decendrive-file";
import { getSuiClient } from "@/lib/sui/client";

export async function GET(request: NextRequest) {
  const owner = request.nextUrl.searchParams.get("owner")?.trim();
  const blobId = request.nextUrl.searchParams.get("blobId")?.trim();

  if (!owner || !blobId) {
    return NextResponse.json({ error: "owner and blobId are required." }, { status: 400 });
  }

  try {
    const match = await findDecenDriveFileForBlob(owner, blobId);
    if (!match?.objectId) {
      return NextResponse.json({
        fileObjectId: null,
        error: "No sender-owned File object found for this blob.",
      });
    }

    const client = getSuiClient();
    const object = await client.getObject({
      id: match.objectId,
      options: { showOwner: true },
    });
    const objectOwner = object.data?.owner
      ? typeof object.data.owner === "object" &&
        object.data.owner !== null &&
        "AddressOwner" in object.data.owner
        ? String((object.data.owner as { AddressOwner: string }).AddressOwner)
        : null
      : null;

    return NextResponse.json({
      fileObjectId: match.objectId,
      objectOwner,
      ownerMatches: objectOwner?.toLowerCase() === owner.toLowerCase(),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Lookup failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
