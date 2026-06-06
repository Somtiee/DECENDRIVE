import type { SharedOutItem } from "@/components/drive/types";
import { FULL_SHARE_PERMISSION_FLAGS } from "@/lib/sui/share-crypto";

export type ShareCompletedPayload = {
  recipient: string;
  txDigest: string;
  createdAt: number;
  items: Array<{
    blobId: string;
    name: string;
    fileObjectId?: string | null;
  }>;
};

export type SharedOutQueryShape = {
  items: SharedOutItem[];
  pagination: { page: number; pageSize: number; total: number; totalPages: number };
  warning?: string;
  stale?: boolean;
};

export function buildOptimisticSharedOutItems(payload: ShareCompletedPayload): SharedOutItem[] {
  return payload.items.map((item) => ({
    invitationId: `optimistic-${payload.txDigest}-${item.blobId}`,
    blobId: item.blobId,
    name: item.name,
    recipient: payload.recipient,
    permissions: FULL_SHARE_PERMISSION_FLAGS,
    createdAt: payload.createdAt,
    status: "pending" as const,
    acceptedAt: 0,
    txDigest: payload.txDigest,
    accessRevoked: false,
    fileObjectId: item.fileObjectId ?? undefined,
  }));
}

export function mergeOptimisticSharedOut(
  current: SharedOutQueryShape | undefined,
  optimisticItems: SharedOutItem[],
  pageSize: number,
): SharedOutQueryShape {
  const withoutStaleOptimistic = (current?.items ?? []).filter(
    (item) => !item.invitationId.startsWith("optimistic-"),
  );
  const merged = [...optimisticItems, ...withoutStaleOptimistic];
  const total = merged.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return {
    items: merged.slice(0, pageSize),
    pagination: {
      page: 1,
      pageSize,
      total,
      totalPages,
    },
    stale: false,
    warning: undefined,
  };
}

export function isOptimisticSharedOutItem(item: SharedOutItem) {
  return item.invitationId.startsWith("optimistic-");
}
