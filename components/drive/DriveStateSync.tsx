"use client";

import { useCurrentAccount, useSignAndExecuteTransaction, useSignPersonalMessage } from "@mysten/dapp-kit";
import { fromBase64 } from "@mysten/bcs";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import {
  applyDriveStateSnapshot,
  collectDriveStateSnapshot,
  readCachedDriveStateMeta,
  writeCachedDriveStateMeta,
} from "@/lib/drive/drive-state-io";
import {
  fetchOwnedFilesWithMetadata,
  loadDriveStateFromWalrus,
  pushDriveStateToWalrus,
  resolveDriveAnchor,
  scheduleDriveStatePush,
  notifyDriveSyncSuccess,
} from "@/lib/drive/drive-sync";
import { hydrateLocalFromOwnedMetadata } from "@/lib/drive/file-onchain";
import { FILE_INDEX_EVENT } from "@/lib/drive/file-metadata";
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

function getDigestFromResult(result: unknown) {
  if (result && typeof result === "object") {
    const record = result as Record<string, unknown>;
    if (typeof record.digest === "string") {
      return record.digest;
    }
  }
  throw new Error("Wallet did not return a transaction digest.");
}

/**
 * Restores drive layout from Walrus on connect and debounces pushes after local edits.
 * localStorage becomes a cache; Walrus + on-chain metadata is the durable source.
 */
export function DriveStateSync() {
  const account = useCurrentAccount();
  const { mutateAsync: signPersonalMessage } = useSignPersonalMessage();
  const { mutateAsync: signAndExecuteTransaction } = useSignAndExecuteTransaction();
  const [hydrated, setHydrated] = useState(false);
  const pushingRef = useRef(false);
  const signPersonalMessageRef = useRef(signPersonalMessage);
  const signAndExecuteTransactionRef = useRef(signAndExecuteTransaction);

  signPersonalMessageRef.current = signPersonalMessage;
  signAndExecuteTransactionRef.current = signAndExecuteTransaction;

  useEffect(() => {
    const address = account?.address;
    if (!address) {
      setHydrated(false);
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
      } finally {
        if (!cancelled) {
          setHydrated(true);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [account?.address]);

  useEffect(() => {
    if (!account?.address || !hydrated) {
      return;
    }

    const onLocalChange = () => {
      scheduleDriveStatePush(collectDriveStateSnapshot());
    };

    const onPushPending = async () => {
      if (pushingRef.current || !account.address) {
        return;
      }
      pushingRef.current = true;
      try {
        const signer = async (message: Uint8Array) => {
          const result = await signPersonalMessageRef.current({ message });
          return getSignatureBytes(result);
        };
        const executeTransaction = async (tx: import("@mysten/sui/transactions").Transaction) => {
          const response = await signAndExecuteTransactionRef.current({
            transaction: tx,
            chain: "sui:mainnet",
          });
          return { digest: getDigestFromResult(response) };
        };
        const result = await pushDriveStateToWalrus({
          owner: account.address,
          snapshot: collectDriveStateSnapshot(),
          signer,
          executeTransaction,
        });
        writeCachedDriveStateMeta({
          updatedAt: Date.now(),
          stateVersion: result.version,
        });
        notifyDriveSyncSuccess();
      } catch (error) {
        const message = error instanceof Error ? error.message : "Drive sync failed.";
        toast.error("Could not sync drive layout to Walrus.", { description: message, duration: 8000 });
      } finally {
        pushingRef.current = false;
      }
    };

    window.addEventListener(FILE_INDEX_EVENT, onLocalChange);
    window.addEventListener("decendrive:drive-sync-pending", onPushPending);
    return () => {
      window.removeEventListener(FILE_INDEX_EVENT, onLocalChange);
      window.removeEventListener("decendrive:drive-sync-pending", onPushPending);
    };
  }, [account?.address, hydrated]);

  return null;
}
