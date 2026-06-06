"use client";

import { useCurrentAccount, useSignPersonalMessage } from "@mysten/dapp-kit";
import { fromBase64 } from "@mysten/bcs";
import { useEffect, useRef } from "react";
import { toast } from "sonner";

import {
  applyDriveStateSnapshot,
  readCachedDriveStateMeta,
  writeCachedDriveStateMeta,
} from "@/lib/drive/drive-state-io";
import {
  fetchOwnedFilesWithMetadata,
  loadDriveStateFromWalrus,
  resolveDriveAnchor,
} from "@/lib/drive/drive-sync";
import { hydrateLocalFromOwnedMetadata } from "@/lib/drive/file-onchain";
import { clearWalletEncryptionKeyCache } from "@/lib/sui/wallet";

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

/**
 * Restores drive layout from Walrus on connect when the on-chain anchor is newer than local cache.
 * Auto-push after uploads/edits is intentionally disabled to avoid repeated wallet signature prompts.
 */
export function DriveStateSync() {
  const account = useCurrentAccount();
  const { mutateAsync: signPersonalMessage } = useSignPersonalMessage();
  const signPersonalMessageRef = useRef(signPersonalMessage);

  signPersonalMessageRef.current = signPersonalMessage;

  useEffect(() => {
    const address = account?.address;
    if (!address) {
      clearWalletEncryptionKeyCache();
      return;
    }

    let cancelled = false;
    void (async () => {
      try {
        const owned = await fetchOwnedFilesWithMetadata(address);
        if (!cancelled && owned.length > 0) {
          hydrateLocalFromOwnedMetadata(owned);
        }

        const anchor = await resolveDriveAnchor(address);
        const localMeta = readCachedDriveStateMeta();
        const needsRemoteRestore =
          Boolean(anchor?.stateBlobId) && localMeta.stateVersion < (anchor?.stateVersion ?? 0);

        if (needsRemoteRestore && anchor?.stateBlobId) {
          const signer = async (message: Uint8Array) => {
            const result = await signPersonalMessageRef.current({ message });
            return getSignatureBytes(result);
          };
          const { snapshot } = await loadDriveStateFromWalrus({ owner: address, signer });
          if (!cancelled && snapshot && snapshot.updatedAt > localMeta.updatedAt) {
            applyDriveStateSnapshot(snapshot, { silent: true });
            writeCachedDriveStateMeta({
              updatedAt: snapshot.updatedAt,
              stateVersion: anchor.stateVersion,
            });
            toast.message("Drive layout restored from Walrus.", { duration: 3500 });
          } else if (!cancelled && snapshot) {
            writeCachedDriveStateMeta({ stateVersion: anchor.stateVersion });
          }
        }
      } catch {
        // Offline, rejected signature, or first-time user — local cache still works.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [account?.address]);

  return null;
}
