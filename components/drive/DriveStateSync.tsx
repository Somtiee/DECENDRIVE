"use client";

import { useCurrentAccount } from "@mysten/dapp-kit";
import { useEffect } from "react";

import { fetchOwnedFilesWithMetadata } from "@/lib/drive/drive-sync";
import { hydrateLocalFromOwnedMetadata } from "@/lib/drive/file-onchain";
import { clearWalletEncryptionKeyCache } from "@/lib/sui/wallet";

/**
 * Hydrates local display metadata from on-chain owned files on wallet connect.
 * Walrus layout restore and auto-push are disabled — no wallet prompts on connect.
 */
export function DriveStateSync() {
  const account = useCurrentAccount();

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
      } catch {
        // Offline or first-time user — local cache still works.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [account?.address]);

  return null;
}
