export type AccessEntryView = {

  address: string;

  expiresAt: number;

  expiresInDays: number;

  revoked: boolean;

  permissions?: number;

  accepted?: boolean;

};



export type ShareInvitationView = {

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



export type OwnedFileView = {

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

  isWalrusBlob?: boolean;

  /** DecenDrive Move File object id (for on-chain trash + metadata). */
  decendriveFileId?: string;

  deletable?: boolean;

  inTrash?: boolean;

  metadata?: Record<string, string>;

  lastAccessed?: number;

  accessList: AccessEntryView[];

  /** Set when viewing a received share (not owner). */

  shareKeyWrapper?: string;

  sharePermissions?: {
    canView: boolean;
    canDownload: boolean;
  };

  accessRevoked?: boolean;

  shareStatus?: "pending" | "accepted";

  shareInvitationId?: string;

  /** Pinned from Received tab into My Drive. */

  savedFromReceived?: boolean;

  /** Walrus on-chain storage end epoch (owner blobs only). */
  storageEndEpoch?: number;

  storageStartEpoch?: number;

  storageSize?: number;

  epochsUntilExpiry?: number;

  needsStorageRenewal?: boolean;

  storageDaysLeft?: number;

  storageExpired?: boolean;

  /** Exact Walrus storage expiry (ms). Drives live countdown in the UI. */
  storageExpiresAtMs?: number;

};



export type SharedOutItem = {

  invitationId: string;

  blobId: string;

  name: string;

  recipient: string;

  permissions: number;

  createdAt: number;

  status: "pending" | "accepted" | "declined";

  acceptedAt: number;

  txDigest?: string;

  accessRevoked?: boolean;

  /** Sender-owned Move File object used for revoke/restore metadata. */
  fileObjectId?: string;

};



export type DriveActivityView = {

  id: string;

  type: "upload" | "shared" | "received";

  blobId: string;

  name: string;

  counterparty?: string;

  timestamp: number;

  detail: string;

  txDigest?: string;

};


