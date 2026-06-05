import { toWalrusBlobId } from "@/lib/sui/blob-id";
import { getSuiClient } from "@/lib/sui/client";
import { decenDrivePackageId, type AccessEntry } from "@/lib/sui/contract";

export type DecenDriveFileRef = {
  objectId: string;
  blobId: string;
  accessList: AccessEntry[];
};

function parseAccessList(raw: unknown): AccessEntry[] {
  if (!Array.isArray(raw)) {
    return [];
  }
  return raw
    .map((entry) => {
      const value = entry as Record<string, unknown>;
      const fields = (value.fields ?? value) as Record<string, unknown>;
      const address = String(fields.address ?? "");
      const expiresAt = Number(fields.expires_at ?? 0);
      const revoked = Boolean(fields.revoked ?? false);
      if (!address) {
        return null;
      }
      return {
        address,
        expiresAt: Number.isFinite(expiresAt) ? expiresAt : 0,
        revoked,
      };
    })
    .filter((entry): entry is AccessEntry => entry !== null);
}

/** Finds an owned Move `File` object (not Walrus blob) for a Walrus blob id. */
export async function findDecenDriveFileForBlob(
  owner: string,
  blobId: string,
): Promise<DecenDriveFileRef | null> {
  const normalizedBlob = toWalrusBlobId(blobId);
  const client = getSuiClient();
  let cursor: string | null | undefined = null;

  for (let page = 0; page < 12; page++) {
    const owned = await client.getOwnedObjects({
      owner,
      cursor,
      options: { showContent: true, showType: true },
      limit: 50,
    });

    for (const item of owned.data) {
      const match = matchFileObject(item, normalizedBlob);
      if (match) {
        return match;
      }
    }

    if (!owned.hasNextPage || !owned.nextCursor) {
      break;
    }
    cursor = owned.nextCursor;
  }

  return null;
}

function matchFileObject(item: unknown, normalizedBlob: string): DecenDriveFileRef | null {
  const record = item as { data?: { objectId?: string; type?: string | null; content?: unknown } | null };
  if (!record.data) {
    return null;
  }
  const objectId = record.data.objectId;
  const type = String(record.data.type ?? "");
  const isFileType =
    type.includes("decendrive::File") ||
    (decenDrivePackageId &&
      decenDrivePackageId !== "0x0" &&
      type.includes(`${decenDrivePackageId}::decendrive::File`));
  if (!objectId || !isFileType) {
    return null;
  }
  const content = record.data.content as Record<string, unknown> | undefined;
  if (!content || content.dataType !== "moveObject") {
    return null;
  }
  const fields = content.fields as Record<string, unknown> | undefined;
  if (!fields) {
    return null;
  }
  const rawBlob = String(fields.blob_id ?? fields.blobId ?? "");
  if (!rawBlob || toWalrusBlobId(rawBlob) !== normalizedBlob) {
    return null;
  }
  return {
    objectId,
    blobId: normalizedBlob,
    accessList: parseAccessList(fields.access_list),
  };
}

export function recipientHasActiveFileAccess(
  accessList: AccessEntry[],
  recipient: string,
): boolean {
  const target = recipient.toLowerCase();
  return accessList.some(
    (entry) => entry.address.toLowerCase() === target && !entry.revoked,
  );
}
