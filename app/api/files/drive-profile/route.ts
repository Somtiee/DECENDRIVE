import { NextRequest, NextResponse } from "next/server";

import { findDriveProfileForOwner } from "@/lib/sui/drive-profile";

export async function GET(request: NextRequest) {
  const owner = request.nextUrl.searchParams.get("owner");
  if (!owner) {
    return NextResponse.json({ profile: null });
  }

  try {
    const profile = await findDriveProfileForOwner(owner);
    return NextResponse.json({
      profile: profile
        ? {
            objectId: profile.objectId,
            stateBlobId: profile.stateBlobId,
            stateVersion: profile.stateVersion,
            updatedAt: profile.updatedAt,
          }
        : null,
    });
  } catch {
    return NextResponse.json({ profile: null });
  }
}
