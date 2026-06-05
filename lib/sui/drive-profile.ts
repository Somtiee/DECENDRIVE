import { getSuiClient } from "@/lib/sui/client";
import { decenDrivePackageId, getDecendrivePackageIdsForQuery } from "@/lib/sui/contract";

export type DriveProfileRecord = {
  objectId: string;
  owner: string;
  stateBlobId: string;
  stateVersion: number;
  updatedAt: number;
};

function parseDriveProfile(
  content: Record<string, unknown>,
  objectId: string,
): DriveProfileRecord | null {
  const fields = content.fields as Record<string, unknown> | undefined;
  if (!fields) {
    return null;
  }
  return {
    objectId,
    owner: String(fields.owner ?? ""),
    stateBlobId: String(fields.state_blob_id ?? ""),
    stateVersion: Number(fields.state_version ?? 0),
    updatedAt: Number(fields.updated_at ?? 0),
  };
}

export function isDriveProfileType(typeName: string, packageId: string) {
  return typeName.includes(`${packageId}::decendrive::DriveProfile`);
}

export async function findDriveProfileForOwner(owner: string): Promise<DriveProfileRecord | null> {
  const client = getSuiClient();
  const packageIds = getDecendrivePackageIdsForQuery();

  const owned = await client.getOwnedObjects({
    owner,
    options: { showContent: true, showType: true },
    limit: 50,
  });

  for (const item of owned.data) {
    const objectId = item.data?.objectId;
    const type = String(item.data?.type ?? "");
    if (!objectId) {
      continue;
    }
    const matches = packageIds.some((packageId) => isDriveProfileType(type, packageId));
    if (!matches) {
      continue;
    }
    const content = item.data?.content as Record<string, unknown> | undefined;
    if (!content || content.dataType !== "moveObject") {
      continue;
    }
    const parsed = parseDriveProfile(content, objectId);
    if (parsed) {
      return parsed;
    }
  }

  return null;
}
