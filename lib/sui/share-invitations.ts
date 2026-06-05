import { toWalrusBlobId } from "@/lib/sui/blob-id";

import { flagsToPermissions } from "@/lib/sui/share-crypto";



const WALRUS_MAINNET_AGGREGATOR = "https://aggregator.walrus-mainnet.walrus.space";



export type ShareInvitationRecord = {

  objectId: string;

  blobId: string;

  sender: string;

  recipient: string;

  name: string;

  mimeType: string;

  size: number;

  encryptionKeyHash: string;

  keyWrapper: string;

  permissions: number;

  canView: boolean;

  canDownload: boolean;

  accessRevoked?: boolean;

  expiresAt: number;

  status: "pending" | "accepted" | "declined";

  createdAt: number;

  acceptedAt: number;

  walrusObjectId?: string;

  fileObjectId?: string;

  walrusUrl: string;

  date: string;

};



export function coerceSuiAddress(raw: unknown): string {
  if (typeof raw === "string") {
    const trimmed = raw.trim();
    if (trimmed.startsWith("0x") && trimmed.length >= 10) {
      return trimmed;
    }
  }
  if (raw && typeof raw === "object") {
    const record = raw as Record<string, unknown>;
    if (typeof record.value === "string") {
      return coerceSuiAddress(record.value);
    }
    if (record.fields && typeof record.fields === "object") {
      return coerceSuiAddress(record.fields);
    }
  }
  return "";
}

function parseOptionId(raw: unknown): string | undefined {

  if (!raw || typeof raw !== "object") {

    return undefined;

  }

  const record = raw as Record<string, unknown>;

  if (record.fields && typeof record.fields === "object") {

    const fields = record.fields as Record<string, unknown>;

    const vec = fields.vec;

    if (Array.isArray(vec) && vec.length > 0) {

      return String(vec[0]);

    }

  }

  return undefined;

}



function coerceU8(value: unknown): number {

  if (typeof value === "number" && Number.isFinite(value)) {

    return value;

  }

  if (typeof value === "string" && value.length > 0) {

    return Number(value);

  }

  if (value && typeof value === "object") {

    const record = value as Record<string, unknown>;

    if ("fields" in record) {

      return coerceU8(record.fields);

    }

  }

  return 0;

}



function statusFromU8(value: unknown): ShareInvitationRecord["status"] {

  const status = coerceU8(value);

  if (status === 1) {

    return "accepted";

  }

  if (status === 2) {

    return "declined";

  }

  return "pending";

}



export function parseShareInvitation(

  content: Record<string, unknown>,

  objectId: string,

): ShareInvitationRecord | null {

  const fields = content.fields as Record<string, unknown> | undefined;

  if (!fields) {

    return null;

  }



  const rawBlobId = String(fields.blob_id ?? "");

  if (!rawBlobId) {

    return null;

  }



  const blobId = toWalrusBlobId(rawBlobId);

  const permissions = Number(fields.permissions ?? 3);

  const perms = flagsToPermissions(permissions);

  const status = statusFromU8(fields.status);

  const createdAt = Number(coerceU8(fields.created_at) || fields.created_at || Date.now());



  const keyWrapper = String(fields.key_wrapper ?? "");



  return {

    objectId,

    blobId,

    sender: coerceSuiAddress(fields.sender),

    recipient: coerceSuiAddress(fields.recipient),

    name: String(fields.filename ?? "Shared file"),

    mimeType: String(fields.mime_type ?? "application/octet-stream"),

    size: Number(fields.size ?? 0),

    encryptionKeyHash: String(fields.encryption_key_hash ?? ""),

    keyWrapper,

    permissions,

    canView: perms.canView,

    canDownload: perms.canDownload,

    expiresAt: Number(fields.expires_at ?? 0),

    status,

    createdAt,

    acceptedAt: Number(coerceU8(fields.accepted_at) || fields.accepted_at || 0),

    walrusObjectId: parseOptionId(fields.walrus_object_id),

    fileObjectId: parseOptionId(fields.file_object_id),

    walrusUrl: `${WALRUS_MAINNET_AGGREGATOR}/v1/blobs/${blobId}`,

    date: new Date(createdAt).toISOString(),

  };

}



export function isAnyShareInvitationType(typeName: string) {
  return typeName.includes("::decendrive::ShareInvitation");
}

export function packageIdFromStructType(typeName: string): string | null {
  const parts = typeName.split("::");
  const packageId = parts[0]?.trim();
  if (packageId?.startsWith("0x") && parts[1] === "decendrive") {
    return packageId;
  }
  return null;
}

export function isShareInvitationType(typeName: string, packageId: string) {
  return (
    isAnyShareInvitationType(typeName) &&
    (typeName.includes(`${packageId}::decendrive::ShareInvitation`) ||
      packageIdFromStructType(typeName) === packageId)
  );
}



export type ShareInvitationOnChainStatus = "pending" | "accepted" | "declined";



export function statusFromInvitationFields(fields: Record<string, unknown>): {

  status: ShareInvitationOnChainStatus;

  acceptedAt: number;

} {

  const statusU8 = coerceU8(fields.status);

  return {

    status: statusU8 === 1 ? "accepted" : statusU8 === 2 ? "declined" : "pending",

    acceptedAt: Number(coerceU8(fields.accepted_at) || fields.accepted_at || 0),

  };

}



export async function getShareInvitationStatuses(invitationIds: string[]) {

  const { getSuiClient } = await import("@/lib/sui/client");

  const { isValidSuiAddress } = await import("@mysten/sui/utils");



  const unique = [...new Set(invitationIds)].filter((id) => isValidSuiAddress(id));

  const statuses = new Map<

    string,

    { status: ShareInvitationOnChainStatus; acceptedAt: number }

  >();



  if (unique.length === 0) {

    return statuses;

  }



  const client = getSuiClient();

  for (let offset = 0; offset < unique.length; offset += 50) {

    const chunk = unique.slice(offset, offset + 50);

    const response = await client.multiGetObjects({

      ids: chunk,

      options: { showContent: true },

    });



    for (const entry of response) {

      const objectId = entry.data?.objectId;

      const content = entry.data?.content;

      if (!objectId || !content || content.dataType !== "moveObject") {

        continue;

      }

      const fields = content.fields as Record<string, unknown>;

      statuses.set(objectId, statusFromInvitationFields(fields));

    }

  }



  return statuses;

}


