"use client";

import { useState } from "react";
import { fromBase64 } from "@mysten/bcs";
import { useSignPersonalMessage } from "@mysten/dapp-kit";
import { toast } from "sonner";

import type { PreviewTarget } from "@/components/drive/PreviewModal";
import type { OwnedFileView } from "@/components/drive/types";
import { guessMimeFromName } from "@/lib/drive/file-metadata";
import { decryptBlobToBytes, decryptSharedBlobToBytes } from "@/lib/sui/walrus";

function getSignatureBytes(result: unknown) {
  if (result && typeof result === "object") {
    const record = result as Record<string, unknown>;
    const signature = record["signature"];
    if (typeof signature === "string" && signature.length > 0) {
      try {
        return fromBase64(signature);
      } catch {
        return new TextEncoder().encode(signature);
      }
    }
  }
  throw new Error("Wallet did not return a personal signature.");
}

async function isShareAccessRevoked(
  file: OwnedFileView,
  recipientAddress?: string | null,
): Promise<boolean> {
  if (file.accessRevoked) {
    return true;
  }
  if (!recipientAddress || file.isOwner || !file.owner || !file.blobId) {
    return false;
  }
  try {
    const params = new URLSearchParams({
      sender: file.owner,
      recipient: recipientAddress,
      blobId: file.blobId,
    });
    if (file.shareInvitationId) {
      params.set("invitationId", file.shareInvitationId);
    }
    if (file.decendriveFileId) {
      params.set("fileObjectId", file.decendriveFileId);
    }
    const response = await fetch(`/api/files/share-access?${params.toString()}`);
    if (!response.ok) {
      return false;
    }
    const data = (await response.json()) as { revoked?: boolean };
    return data.revoked === true;
  } catch {
    return false;
  }
}

export function useFileActions(
  onPreview: (preview: PreviewTarget) => void,
  options?: {
    recipientAddress?: string | null;
    onAccessRevoked?: (fileName: string) => void;
  },
) {
  const { mutateAsync: signPersonalMessage } = useSignPersonalMessage();
  const [busyBlobId, setBusyBlobId] = useState<string | null>(null);

  const sign = async (message: Uint8Array) => {
    const result = await signPersonalMessage({ message });
    return getSignatureBytes(result);
  };

  const decryptFile = async (file: OwnedFileView) => {
    if (file.shareKeyWrapper && options?.recipientAddress) {
      const shareOwner = file.owner;
      return decryptSharedBlobToBytes({
        blobId: file.blobId,
        owner: shareOwner,
        recipient: options.recipientAddress,
        keyWrapper: file.shareKeyWrapper,
        encryptionKeyHash: file.encryptionKeyHash,
      });
    }
    return decryptBlobToBytes({
      blobId: file.blobId,
      owner: file.owner,
      encryptionKeyHash: file.encryptionKeyHash,
      signer: sign,
    });
  };

  const guardRevoked = async (file: OwnedFileView) => {
    const revoked = await isShareAccessRevoked(file, options?.recipientAddress);
    if (revoked) {
      options?.onAccessRevoked?.(file.name);
      return true;
    }
    return false;
  };

  const openPreview = async (file: OwnedFileView) => {
    if (await guardRevoked(file)) {
      return;
    }
    if (!file.isOwner && !file.canAccess && !file.shareKeyWrapper) {
      toast.error("You no longer have access to this file.");
      return;
    }
    if (file.sharePermissions && !file.sharePermissions.canView) {
      toast.error("You only have download permission for this file.");
      return;
    }
    setBusyBlobId(file.blobId);
    const toastId = toast.loading(`Decrypting "${file.name}" in your browser…`);
    try {
      const bytes = await decryptFile(file);
      toast.dismiss(toastId);
      const mimeType = file.mimeType || guessMimeFromName(file.name);
      const arrayBuffer = bytes.buffer.slice(
        bytes.byteOffset,
        bytes.byteOffset + bytes.byteLength,
      ) as ArrayBuffer;
      const url = URL.createObjectURL(new Blob([arrayBuffer], { type: mimeType }));
      onPreview({ name: file.name, mimeType, url });
    } catch (error) {
      toast.dismiss(toastId);
      const message = error instanceof Error ? error.message : "Preview failed.";
      toast.error(message);
    } finally {
      setBusyBlobId(null);
    }
  };

  const download = async (file: OwnedFileView) => {
    if (await guardRevoked(file)) {
      return;
    }
    if (file.sharePermissions && !file.sharePermissions.canDownload) {
      toast.error("You do not have download permission for this file.");
      return;
    }
    setBusyBlobId(file.blobId);
    const toastId = toast.loading(`Decrypting "${file.name}" for download…`);
    try {
      const bytes = await decryptFile(file);
      toast.dismiss(toastId);
      const arrayBuffer = bytes.buffer.slice(
        bytes.byteOffset,
        bytes.byteOffset + bytes.byteLength,
      ) as ArrayBuffer;
      const blob = new Blob([arrayBuffer], { type: "application/octet-stream" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = file.name;
      link.click();
      URL.revokeObjectURL(url);
      toast.success("Downloaded — decrypted locally on your device.");
    } catch (error) {
      toast.dismiss(toastId);
      const message = error instanceof Error ? error.message : "Download failed.";
      toast.error(message);
    } finally {
      setBusyBlobId(null);
    }
  };

  return { busyBlobId, openPreview, download, isShareAccessRevoked };
}
