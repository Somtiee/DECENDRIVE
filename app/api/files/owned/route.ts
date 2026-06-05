import { NextRequest, NextResponse } from "next/server";

import { paginateSlice, parsePageParams } from "@/lib/drive/pagination";
import { isSystemWalrusBlob } from "@/lib/drive/system-blobs";
import { toWalrusBlobId } from "@/lib/sui/blob-id";
import { getSuiClient } from "@/lib/sui/client";
import { computeStorageExpiresAtMs, estimateStorageDaysLeft } from "@/lib/drive/storage-display";
import {
  fetchWalrusEpochInfo,
  parseWalrusBlobStorage,
  shouldRenewWalrusStorage,
} from "@/lib/sui/walrus-storage";
import {
  META_DISPLAY_NAME,
  META_MIME_TYPE,
} from "@/lib/sui/file-metadata-keys";
import { parseVecMapMetadata } from "@/lib/sui/parse-metadata";
import { tatumSuiRpc } from "@/lib/tatum";

const WALRUS_MAINNET_AGGREGATOR = "https://aggregator.walrus-mainnet.walrus.space";

type ParsedFileRecord = {
  objectId: string;
  name: string;
  size: number;
  date: string;
  blobId: string;
  walrusUrl: string;
  owner: string;
  isOwner: boolean;
  canAccess: boolean;
  encryptionKeyHash: string;
  mimeType?: string;
  isWalrusBlob: boolean;
  deletable: boolean;
  inTrash: boolean;
  isSystemBlob: boolean;
  lastAccessed: number;
  accessList: Array<{
    address: string;
    expiresAt: number;
    expiresInDays: number;
    revoked: boolean;
  }>;
  metadata?: Record<string, string>;
  decendriveFileId?: string;
  storageEndEpoch?: number;
  storageStartEpoch?: number;
  storageSize?: number;
  epochsUntilExpiry?: number;
  needsStorageRenewal?: boolean;
  storageDaysLeft?: number;
  storageExpired?: boolean;
  storageExpiresAtMs?: number;
};

// Walrus stores the original filename/mime/size as on-chain blob "attributes"
// (a Metadata dynamic field on the Blob object). Read them so the UI shows real
// names instead of opaque blob IDs.
function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function rpcWithRetry<T>(method: string, params: unknown[], attempts = 3): Promise<T | null> {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      return await tatumSuiRpc<T>(method, params);
    } catch {
      if (attempt < attempts - 1) {
        await delay(400 * (attempt + 1));
      }
    }
  }
  return null;
}

async function fetchBlobAttributes(objectId: string): Promise<Record<string, string> | null> {
  const dynamic = await rpcWithRetry<{
    data?: Array<{ name: { type: string; value: unknown }; objectType?: string }>;
  }>("suix_getDynamicFields", [objectId, null, 50]);

  const metaField = (dynamic?.data ?? []).find((field) =>
    String(field.objectType ?? "").toLowerCase().includes("metadata"),
  );
  if (!metaField) {
    return null;
  }

  const object = await rpcWithRetry<{
    data?: {
      content?: {
        fields?: {
          value?: {
            fields?: {
              metadata?: { fields?: { contents?: Array<{ fields: { key: string; value: string } }> } };
            };
          };
        };
      };
    };
  }>("suix_getDynamicFieldObject", [objectId, { type: metaField.name.type, value: metaField.name.value }]);

  const contents = object?.data?.content?.fields?.value?.fields?.metadata?.fields?.contents ?? [];
  if (contents.length === 0) {
    return null;
  }
  const attributes: Record<string, string> = {};
  for (const entry of contents) {
    if (entry?.fields?.key) {
      attributes[entry.fields.key] = entry.fields.value;
    }
  }
  return attributes;
}

function parseAccessList(raw: unknown) {
  if (!Array.isArray(raw)) {
    return [];
  }

  return raw
    .map((entry) => {
      const value = entry as Record<string, unknown>;
      const fields = (value.fields ?? value) as Record<string, unknown>;
      const address = String(fields.address ?? fields.shared_with ?? "");
      const expiresAt = Number(fields.expires_at ?? 0);
      const revoked = Boolean(fields.revoked ?? false);

      if (!address) {
        return null;
      }

      return {
        address,
        expiresAt: Number.isFinite(expiresAt) ? expiresAt : 0,
        expiresInDays:
          Number.isFinite(expiresAt) && expiresAt > 0
            ? Math.max(1, Math.ceil((expiresAt - Date.now()) / (24 * 60 * 60 * 1000)))
            : 0,
        revoked,
      };
    })
    .filter(
      (entry): entry is { address: string; expiresAt: number; expiresInDays: number; revoked: boolean } =>
        entry !== null,
    );
}

function toIsoDate(raw: unknown) {
  const fallback = new Date().toISOString();
  if (typeof raw === "number" && Number.isFinite(raw)) {
    return new Date(raw).toISOString();
  }
  if (typeof raw === "string") {
    const asNumber = Number(raw);
    if (Number.isFinite(asNumber) && raw.trim() !== "") {
      return new Date(asNumber).toISOString();
    }
    const parsed = new Date(raw);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed.toISOString();
    }
  }
  return fallback;
}

function isOwnedDriveFileType(typeName: string) {
  if (typeName.includes("::decendrive::ShareInvitation")) {
    return false;
  }
  if (typeName.includes("::decendrive::DriveProfile")) {
    return false;
  }
  return typeName.endsWith("::blob::Blob") || typeName.includes("::decendrive::File");
}

function parseRecord(
  content: Record<string, unknown>,
  objectId: string,
  currentOwnerAddress: string,
): ParsedFileRecord | null {
  const fields = content.fields as Record<string, unknown> | undefined;
  if (!fields) {
    return null;
  }

  const typeName = String(content.type ?? "");
  if (!isOwnedDriveFileType(typeName)) {
    return null;
  }

  const rawBlobId = String(fields["blobId"] ?? fields["blob_id"] ?? "");
  if (!rawBlobId) {
    return null;
  }

  const blobId = toWalrusBlobId(rawBlobId);
  const isWalrusBlob = typeName.endsWith("::blob::Blob");
  const walrusStorage = isWalrusBlob ? parseWalrusBlobStorage(fields) : null;
  const deletable = Boolean(fields["deletable"] ?? false);
  const shortBlob = blobId.slice(0, 10);
  const name = String(
    fields["name"] ?? fields["filename"] ?? (isWalrusBlob ? `Walrus blob ${shortBlob}` : "Untitled"),
  );
  const size = Number(fields["size"] ?? 0);
  const date = toIsoDate(fields["uploaded_at"] ?? fields["timestamp"] ?? fields["created_at"]);
  const owner = String(fields["owner"] ?? currentOwnerAddress);
  const encryptionKeyHash = String(fields["encryption_key_hash"] ?? fields["encryptionKeyHash"] ?? "");
  const inTrash = Boolean(fields["in_trash"] ?? false);
  const lastAccessed = Number(fields["last_accessed"] ?? Date.now());
  const accessList = parseAccessList(fields["access_list"]);
  const metadata = parseVecMapMetadata(fields["metadata"]);
  const now = Date.now();

  const directAccess = accessList.find((entry) => entry.address.toLowerCase() === currentOwnerAddress.toLowerCase());
  const canAccess =
    owner.toLowerCase() === currentOwnerAddress.toLowerCase() ||
    Boolean(directAccess && !directAccess.revoked && (directAccess.expiresAt === 0 || directAccess.expiresAt > now));

  const displayName = metadata[META_DISPLAY_NAME]?.trim();
  const mimeFromMeta = metadata[META_MIME_TYPE]?.trim();

  return {
    objectId,
    name: displayName || name,
    size: Number.isFinite(size) ? size : 0,
    date,
    blobId,
    walrusUrl: `${WALRUS_MAINNET_AGGREGATOR}/v1/blobs/${blobId}`,
    owner,
    isOwner: owner.toLowerCase() === currentOwnerAddress.toLowerCase(),
    canAccess,
    encryptionKeyHash,
    mimeType: mimeFromMeta || undefined,
    isWalrusBlob,
    deletable,
    inTrash,
    isSystemBlob: isSystemWalrusBlob({ name }),
    lastAccessed: Number.isFinite(lastAccessed) ? lastAccessed : Date.now(),
    accessList,
    metadata: Object.keys(metadata).length > 0 ? metadata : undefined,
    storageEndEpoch: walrusStorage?.endEpoch,
    storageStartEpoch: walrusStorage?.startEpoch,
    storageSize: walrusStorage?.storageSize,
  };
}

function applyAttributes(record: ParsedFileRecord, attributes: Record<string, string>): ParsedFileRecord {
  const filename = attributes["filename"];
  const mimeType = attributes["mimeType"];
  const size = Number(attributes["size"]);
  const uploadedAt = Number(attributes["uploadedAt"]);
  const encryptionKeyHash = attributes["encryptionKeyHash"];
  const purpose = attributes["purpose"];
  const resolvedName = filename && filename.trim() ? filename : record.name;

  return {
    ...record,
    name: resolvedName,
    mimeType: mimeType && mimeType.trim() ? mimeType : record.mimeType,
    size: Number.isFinite(size) && size > 0 ? size : record.size,
    date: Number.isFinite(uploadedAt) && uploadedAt > 0 ? new Date(uploadedAt).toISOString() : record.date,
    encryptionKeyHash: encryptionKeyHash && encryptionKeyHash.trim() ? encryptionKeyHash : record.encryptionKeyHash,
    isSystemBlob: isSystemWalrusBlob({ name: resolvedName, purpose }),
  };
}

export async function GET(request: NextRequest) {
  const owner = request.nextUrl.searchParams.get("owner");
  const { page, pageSize } = parsePageParams(request.nextUrl.searchParams, 12);
  if (!owner) {
    return NextResponse.json({
      files: [],
      pagination: { page: 1, pageSize, total: 0, totalPages: 1 },
    });
  }

  try {
    type OwnedRow = {
      data?: {
        objectId?: string;
        type?: string;
        content?: Record<string, unknown>;
      };
    };

    const ownedData: OwnedRow[] = [];
    let cursor: string | null | undefined = null;

    const appendPage = async (rows: OwnedRow[]) => {
      ownedData.push(...rows);
    };

    try {
      const client = getSuiClient();
      for (let page = 0; page < 25; page += 1) {
        const batch = await client.getOwnedObjects({
          owner,
          cursor,
          options: { showContent: true, showType: true },
          limit: 50,
        });
        await appendPage(batch.data as OwnedRow[]);
        if (!batch.hasNextPage || !batch.nextCursor) {
          break;
        }
        cursor = batch.nextCursor;
      }
    } catch {
      cursor = null;
      for (let page = 0; page < 25; page += 1) {
        type OwnedRpcPage = {
          data?: OwnedRow[];
          hasNextPage?: boolean;
          nextCursor?: string | null;
        };
        const rpc: OwnedRpcPage =
          (await tatumSuiRpc<OwnedRpcPage>("suix_getOwnedObjects", [
            owner,
            { cursor, options: { showContent: true, showType: true }, limit: 50 },
          ])) ?? { data: [] };
        await appendPage(rpc.data ?? []);
        if (!rpc.hasNextPage || !rpc.nextCursor) {
          break;
        }
        cursor = rpc.nextCursor;
      }
    }

    const baseFiles = ownedData
      .map((item) => {
        const objectId = item.data?.objectId;
        const content = item.data?.content as Record<string, unknown> | undefined;
        if (!objectId || !content || content["dataType"] !== "moveObject") {
          return null;
        }
        const contentWithType = {
          ...content,
          type: item.data?.type ?? content.type,
        };
        return parseRecord(contentWithType, objectId, owner);
      })
      .filter((item): item is ParsedFileRecord => item !== null);

    // Enrich Walrus blobs with their on-chain attributes (real filename, mime, size).
    // Done sequentially to avoid bursting the RPC gateway's rate limit.
    const files: ParsedFileRecord[] = [];
    for (const file of baseFiles) {
      if (!file.isWalrusBlob) {
        files.push(file);
        continue;
      }
      const attributes = await fetchBlobAttributes(file.objectId);
      files.push(attributes ? applyAttributes(file, attributes) : file);
    }

    const decendriveFileByBlob = new Map<string, ParsedFileRecord>();
    for (const file of baseFiles) {
      if (!file.isWalrusBlob) {
        decendriveFileByBlob.set(file.blobId, file);
      }
    }

    // One Walrus blob + one Move File share the same blob_id after upload — show a single row.
    // Merge in_trash + metadata from the DecenDrive File onto the Walrus display row.
    const walrusBlobIds = new Set(
      files.filter((file) => file.isWalrusBlob).map((file) => file.blobId),
    );
    const deduped = files
      .filter((file) => file.isWalrusBlob || !walrusBlobIds.has(file.blobId))
      .map((file) => {
        const paired = decendriveFileByBlob.get(file.blobId);
        if (file.isWalrusBlob && paired) {
          const mergedMetadata = {
            ...(file.metadata ?? {}),
            ...(paired.metadata ?? {}),
          };
          const displayName = mergedMetadata[META_DISPLAY_NAME]?.trim();
          return {
            ...file,
            inTrash: paired.inTrash,
            decendriveFileId: paired.objectId,
            metadata: Object.keys(mergedMetadata).length > 0 ? mergedMetadata : undefined,
            name: displayName || paired.name || file.name,
            accessList: paired.accessList.length > 0 ? paired.accessList : file.accessList,
          };
        }
        return {
          ...file,
          decendriveFileId: paired?.objectId ?? (!file.isWalrusBlob ? file.objectId : undefined),
          inTrash: paired?.inTrash ?? file.inTrash,
        };
      });

    const visible = deduped.filter((file) => !file.isSystemBlob);

    let walrusEpoch = 0;
    let walrusEpochDurationMs = 0;
    try {
      const epochInfo = await fetchWalrusEpochInfo();
      walrusEpoch = epochInfo.currentEpoch;
      walrusEpochDurationMs = epochInfo.epochDurationMs;
      for (const file of visible) {
        if (file.storageEndEpoch) {
          const epochsLeft = Math.max(0, file.storageEndEpoch - walrusEpoch);
          file.epochsUntilExpiry = epochsLeft;
          file.storageExpired = epochsLeft <= 0;
          file.needsStorageRenewal = shouldRenewWalrusStorage(file.storageEndEpoch, walrusEpoch);
          file.storageDaysLeft = estimateStorageDaysLeft(epochsLeft, epochInfo.epochDurationMs);
          file.storageExpiresAtMs = computeStorageExpiresAtMs(file.storageEndEpoch, epochInfo);
        }
      }
    } catch {
      // Epoch lookup is best-effort; renewal UI can retry client-side.
    }

    const sorted = [...visible].sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
    );
    const paged = paginateSlice(sorted, page, pageSize);
    return NextResponse.json({
      files: paged.items,
      pagination: paged.pagination,
      walrus:
        walrusEpoch > 0
          ? { currentEpoch: walrusEpoch, epochDurationMs: walrusEpochDurationMs }
          : undefined,
    });
  } catch {
    return NextResponse.json(
      { files: [], pagination: { page: 1, pageSize, total: 0, totalPages: 1 } },
      { status: 200 },
    );
  }
}
