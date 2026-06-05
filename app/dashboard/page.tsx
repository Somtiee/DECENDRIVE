"use client";



import { useCurrentAccount, useSignAndExecuteTransaction } from "@mysten/dapp-kit";

import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";

import { useCallback, useEffect, useMemo, useState } from "react";


import { toast } from "sonner";



import { DriveExplorer } from "@/components/drive/DriveExplorer";

import { PreviewModal, type PreviewTarget } from "@/components/drive/PreviewModal";

import { ReceivedPanel } from "@/components/drive/ReceivedPanel";

import { DriveStateSync } from "@/components/drive/DriveStateSync";
import { StorageRentPanel } from "@/components/drive/StorageRentPanel";
import { selectExpiredRentFiles } from "@/lib/drive/storage-display";
import { ShareModal } from "@/components/drive/ShareModal";

import type { ShareTarget } from "@/components/drive/share-target";

import { SharedOutPanel } from "@/components/drive/SharedOutPanel";

import { UploadZone } from "@/components/drive/UploadZone";

import { useDriveSearch } from "@/components/drive/DriveSearchProvider";
import { MobileDriveNav } from "@/components/drive/MobileDriveNav";
import { Sidebar, type DriveView } from "@/components/drive/sidebar";
import { ViewTrustBanner, type DriveTrustView } from "@/components/drive/trust";
import type { ShareInvitationView } from "@/components/drive/types";
import { matchesDriveSearch, type DriveSearchResult } from "@/lib/drive/search";

import { TopNavbar } from "@/components/drive/top-navbar";

import type { OwnedFileView } from "@/components/drive/types";

import { Badge } from "@/components/ui/badge";
import type { PageSizeOption } from "@/lib/drive/pagination";

import {

  collectFolderFileBlobIds,

  FILE_INDEX_EVENT,

  getFileMetaMap,

  renameFile,

  type DriveFolder,

  type StoredFileMeta,

} from "@/lib/drive/file-metadata";
import {

  collectTrashBlobIdsForFolder,

  getTrashedBlobIds,

  getTrashedDriveFolders,

  moveFolderToTrash,

  permanentRemoveFolderFromDrive,

  permanentRemoveFromDrive,

  purgeExpiredTrash,

  restoreFileFromTrash,

  restoreFolderFromTrash,

  TRASH_CHANGED_EVENT,
  TRASH_RETENTION_DAYS,

} from "@/lib/drive/trash";

import { getHiddenBlobIds } from "@/lib/drive/hidden-blobs";
import { isSystemWalrusBlob } from "@/lib/drive/system-blobs";
import { getSavedReceivedFiles } from "@/lib/drive/saved-received";
import {
  moveFilesToTrashWithChain,
  restoreFilesFromTrashWithChain,
  syncDisplayNameOnChain,
  syncRevokeRecipientOnChain,
  syncRestoreRecipientOnChain,
  resolveDecendriveFileIdForBlob,
  resolveFileObjectIdForShareItem,
} from "@/lib/drive/file-onchain";
import { renewWalrusStorageBatch, toRenewalCandidate } from "@/lib/drive/storage-renewal";

import { buildDeleteBlobTransaction } from "@/lib/sui/walrus";

import { clearPanelCache, readPanelCache, writePanelCache } from "@/lib/drive/panel-cache";
import { setActiveWallet } from "@/lib/drive/wallet-storage";

import { shortenAddress } from "@/lib/utils";



const VIEW_HEADINGS: Record<DriveView, string> = {

  "my-drive": "My Drive",

  trash: "Trash",

  shared: "Shared",

  received: "Received",

  "storage-rent": "Storage rent",

};

const VIEW_TRUST_MAP: Record<DriveView, DriveTrustView> = {

  "my-drive": "my-drive",

  trash: "trash",

  shared: "shared",

  received: "received",

  "storage-rent": "storage-rent",

};



export default function DashboardPage() {

  const account = useCurrentAccount();

  const address = account?.address ?? null;

  const isConnected = Boolean(address);

  const queryClient = useQueryClient();

  const { mutateAsync: signAndExecuteTransaction } = useSignAndExecuteTransaction();

  const driveSearch = useDriveSearch();

  const [currentView, setCurrentView] = useState<DriveView>("my-drive");

  const [viewMode, setViewMode] = useState<"list" | "grid">("list");

  const [preview, setPreview] = useState<PreviewTarget | null>(null);

  const [shareTarget, setShareTarget] = useState<ShareTarget | null>(null);

  const [metaMap, setMetaMap] = useState<Record<string, StoredFileMeta>>({});

  const [trashedIds, setTrashedIds] = useState<string[]>([]);

  const [hiddenIds, setHiddenIds] = useState<string[]>([]);

  const [trashFolders, setTrashFolders] = useState<DriveFolder[]>([]);

  const [listPageSize, setListPageSize] = useState<PageSizeOption>(10);
  const [myDrivePage, setMyDrivePage] = useState(1);
  const [trashPage, setTrashPage] = useState(1);
  const [storageRentPage, setStorageRentPage] = useState(1);
  const [pendingPage, setPendingPage] = useState(1);
  const [receivedPage, setReceivedPage] = useState(1);
  const [sharedOutPage, setSharedOutPage] = useState(1);
  const [uploadPage, setUploadPage] = useState(1);

  const handleListPageSizeChange = useCallback(
    (nextSize: PageSizeOption) => {
      setListPageSize(nextSize);
      setMyDrivePage(1);
      setTrashPage(1);
      setStorageRentPage(1);
      setPendingPage(1);
      setReceivedPage(1);
      setSharedOutPage(1);
    },
    [],
  );
  const [savedReceivedRevision, setSavedReceivedRevision] = useState(0);
  const [renewingObjectIds, setRenewingObjectIds] = useState<Set<string>>(() => new Set());



  const reloadIndex = useCallback(() => {

    setActiveWallet(address);

    setMetaMap(getFileMetaMap());

    setTrashedIds(getTrashedBlobIds());

    setHiddenIds(getHiddenBlobIds());

    setTrashFolders(getTrashedDriveFolders());

  }, [address]);



  useEffect(() => {

    const handler = () => {
      reloadIndex();
      setSavedReceivedRevision((value) => value + 1);
    };

    window.addEventListener(FILE_INDEX_EVENT, handler);
    window.addEventListener(TRASH_CHANGED_EVENT, handler);

    return () => {
      window.removeEventListener(FILE_INDEX_EVENT, handler);
      window.removeEventListener(TRASH_CHANGED_EVENT, handler);
    };

  }, [reloadIndex]);

  const handlePreview = useCallback((target: PreviewTarget) => {

    setPreview((prev) => {

      if (prev) {

        URL.revokeObjectURL(prev.url);

      }

      return target;

    });

  }, []);



  const closePreview = useCallback(() => {

    setPreview((prev) => {

      if (prev) {

        URL.revokeObjectURL(prev.url);

      }

      return null;

    });

  }, []);



  useEffect(() => {

    reloadIndex();

    setShareTarget(null);

    closePreview();

    setMyDrivePage(1);
    setTrashPage(1);
    setStorageRentPage(1);
    setPendingPage(1);
    setReceivedPage(1);
    setSharedOutPage(1);
    setUploadPage(1);

    void queryClient.invalidateQueries({ queryKey: ["owned-files"] });

    void queryClient.invalidateQueries({ queryKey: ["received-invitations"] });

    void queryClient.invalidateQueries({ queryKey: ["shared-out"] });
    void queryClient.invalidateQueries({ queryKey: ["shared-index"] });
    void queryClient.invalidateQueries({ queryKey: ["received-index"] });

  }, [address, closePreview, queryClient, reloadIndex]);



  const ownedCacheKey = address ? `owned:${address}` : null;

  const cachedOwned = useMemo(() => {
    if (!ownedCacheKey) {
      return undefined;
    }
    const cached = readPanelCache<{ files: OwnedFileView[] } | null>(ownedCacheKey, null);
    return cached?.files?.length ? cached : undefined;
  }, [ownedCacheKey]);

  const ownedQuery = useQuery({
    queryKey: ["owned-files", address],
    enabled: isConnected,
    staleTime: 12_000,
    gcTime: 30 * 60_000,
    placeholderData: keepPreviousData,
    initialData: cachedOwned,
    initialDataUpdatedAt: cachedOwned ? Date.now() - 60_000 : undefined,
    queryFn: async () => {
      const response = await fetch(
        `/api/files/owned?owner=${address ?? ""}&page=1&pageSize=200`,
        { cache: "no-store" },
      );
      if (!response.ok) {
        throw new Error("Failed to load files.");
      }
      const data = (await response.json()) as { files: OwnedFileView[] };
      if (ownedCacheKey && data.files.length > 0) {
        writePanelCache(ownedCacheKey, data);
      }
      return data;
    },
  });



  const permanentlyDeleteFile = useCallback(

    async (file: OwnedFileView) => {

      if (!address) {

        toast.error("Connect your wallet to delete files.");

        return;

      }



      if (file.isWalrusBlob && file.deletable) {

        const toastId = toast.loading(`Deleting "${file.name}" on-chain…`);

        try {

          const tx = buildDeleteBlobTransaction(file.objectId, address);

          await signAndExecuteTransaction({ transaction: tx, chain: "sui:mainnet" });

          permanentRemoveFromDrive(file.blobId);

          toast.success(`"${file.name}" permanently deleted from Walrus.`, { id: toastId });

        } catch (error) {

          const message = error instanceof Error ? error.message : "Delete transaction failed.";

          toast.error("Could not delete on-chain.", { id: toastId, description: message });

          throw error;

        }

        return;

      }



      permanentRemoveFromDrive(file.blobId);

      if (file.isWalrusBlob && !file.deletable) {

        toast.success(`"${file.name}" removed from DecenDrive.`, {

          description:

            "This blob is not deletable on-chain yet; it stays hidden here until it expires on Walrus.",

        });

      } else {

        toast.success(`"${file.name}" permanently removed.`);

      }

    },

    [address, signAndExecuteTransaction],

  );



  const purgeExpiredAndMaybeOnChain = useCallback(async () => {

    const { expiredBlobIds } = purgeExpiredTrash();

    if (expiredBlobIds.length === 0) {

      return;

    }



    reloadIndex();

    if (!address) {

      return;

    }



    const allFiles = ownedQuery.data?.files ?? [];

    const expiredFiles = allFiles.filter((file) => expiredBlobIds.includes(file.blobId));



    for (const file of expiredFiles) {

      if (file.isWalrusBlob && file.deletable) {

        try {

          const tx = buildDeleteBlobTransaction(file.objectId, address);

          await signAndExecuteTransaction({ transaction: tx, chain: "sui:mainnet" });

        } catch {

          // Local metadata already purged; user can retry from chain explorer if needed.

        }

      }

    }



    if (expiredFiles.length > 0) {

      toast.message(

        `${expiredFiles.length} item${expiredFiles.length === 1 ? "" : "s"} removed after ${TRASH_RETENTION_DAYS} days in Trash.`,

      );

      void ownedQuery.refetch();

    }

  }, [address, ownedQuery, reloadIndex, signAndExecuteTransaction]);



  useEffect(() => {

    if (!isConnected || ownedQuery.isLoading) {

      return;

    }

    void purgeExpiredAndMaybeOnChain();

  }, [isConnected, ownedQuery.isLoading, ownedQuery.dataUpdatedAt, purgeExpiredAndMaybeOnChain]);



  const decorate = useCallback(

    (list: OwnedFileView[]): OwnedFileView[] =>

      list.map((file) => {

        const meta = metaMap[file.blobId];

        return {

          ...file,

          name: meta?.name ?? file.name,

          mimeType: meta?.mimeType ?? file.mimeType,

          size: meta?.size ?? file.size,

        };

      }),

    [metaMap],

  );



  const trashedIdSet = useMemo(() => new Set(trashedIds), [trashedIds]);

  const hiddenIdSet = useMemo(() => new Set(hiddenIds), [hiddenIds]);



  const decoratedOwned = useMemo(

    () =>

      decorate(ownedQuery.data?.files ?? []).filter(

        (file) => !isSystemWalrusBlob({ name: file.name, purpose: file.metadata?.purpose }),

      ),

    [decorate, ownedQuery.data],

  );

  const expiredRentCount = useMemo(
    () => selectExpiredRentFiles(decoratedOwned).length,
    [decoratedOwned],
  );



  const ownedFiles = useMemo(() => {

    const seenBlobIds = new Set<string>();

    const uploads = decoratedOwned.filter((file) => {

      if (!file.isOwner || hiddenIdSet.has(file.blobId)) {

        return false;

      }

      if (file.inTrash) {

        return false;

      }

      if (!file.decendriveFileId && trashedIdSet.has(file.blobId)) {

        return false;

      }

      if (seenBlobIds.has(file.blobId)) {

        return false;

      }

      seenBlobIds.add(file.blobId);

      return true;

    });

    const saved = getSavedReceivedFiles()
      .filter((entry) => !seenBlobIds.has(entry.blobId) && !trashedIdSet.has(entry.blobId))
      .map(
        (entry): OwnedFileView => ({
          objectId: entry.walrusObjectId ?? entry.shareInvitationId,
          name: entry.name,
          size: entry.size,
          date: new Date(entry.savedAt).toISOString(),
          blobId: entry.blobId,
          walrusUrl: entry.walrusUrl,
          owner: entry.owner,
          isOwner: false,
          canAccess: entry.sharePermissions.canView,
          encryptionKeyHash: entry.encryptionKeyHash,
          mimeType: entry.mimeType,
          shareKeyWrapper: entry.shareKeyWrapper,
          sharePermissions: entry.sharePermissions,
          shareStatus: "accepted",
          shareInvitationId: entry.shareInvitationId,
          savedFromReceived: true,
          accessList: [],
        }),
      );

    return [...uploads, ...saved];

  }, [decoratedOwned, trashedIdSet, hiddenIdSet, savedReceivedRevision]);



  const trashFiles = useMemo(

    () =>

      decoratedOwned.filter(

        (file) =>

          file.isOwner &&

          !hiddenIdSet.has(file.blobId) &&

          (file.inTrash || (!file.decendriveFileId && trashedIdSet.has(file.blobId))),

      ),

    [decoratedOwned, trashedIdSet, hiddenIdSet],

  );

  const receivedIndexQuery = useQuery({
    queryKey: ["received-index", address],
    enabled: isConnected,
    staleTime: 60_000,
    queryFn: async () => {
      const response = await fetch(
        `/api/files/received?recipient=${encodeURIComponent(address ?? "")}&pendingPage=1&receivedPage=1`,
        { cache: "no-store" },
      );
      if (!response.ok) {
        return { pending: { items: [] as ShareInvitationView[] }, received: { items: [] as ShareInvitationView[] } };
      }
      return (await response.json()) as {
        pending: { items: ShareInvitationView[] };
        received: { items: ShareInvitationView[] };
      };
    },
  });

  const sharedIndexQuery = useQuery({
    queryKey: ["shared-index", address],
    enabled: isConnected,
    staleTime: 60_000,
    queryFn: async () => {
      const response = await fetch(
        `/api/files/shared-out?sender=${address}&page=1&pageSize=50`,
        { cache: "no-store" },
      );
      if (!response.ok) {
        return { items: [] as Array<{ blobId: string; name: string; recipient: string }> };
      }
      return (await response.json()) as {
        items: Array<{ blobId: string; name: string; recipient: string }>;
      };
    },
  });

  useEffect(() => {
    const index: DriveSearchResult[] = [];

    for (const file of ownedFiles) {
      index.push({
        id: `owned-${file.blobId}`,
        kind: "owned",
        view: "my-drive",
        name: file.name,
        blobId: file.blobId,
      });
    }

    for (const file of trashFiles) {
      index.push({
        id: `trash-${file.blobId}`,
        kind: "trash",
        view: "trash",
        name: file.name,
        blobId: file.blobId,
        subtitle: "In Trash",
      });
    }

    const pending = receivedIndexQuery.data?.pending.items ?? [];
    const received = receivedIndexQuery.data?.received.items ?? [];

    for (const invite of pending) {
      index.push({
        id: `pending-${invite.objectId}`,
        kind: "received-pending",
        view: "received",
        name: invite.name,
        blobId: invite.blobId,
        subtitle: `Pending from ${invite.sender.slice(0, 8)}…`,
      });
    }

    for (const invite of received) {
      index.push({
        id: `received-${invite.objectId}`,
        kind: "received",
        view: "received",
        name: invite.name,
        blobId: invite.blobId,
        subtitle: `From ${invite.sender.slice(0, 8)}…`,
      });
    }

    for (const item of sharedIndexQuery.data?.items ?? []) {
      index.push({
        id: `shared-${item.blobId}-${item.recipient}`,
        kind: "shared",
        view: "shared",
        name: item.name,
        blobId: item.blobId,
        subtitle: `To ${item.recipient.slice(0, 8)}…`,
      });
    }

    driveSearch.setIndex(index);
    // setIndex is stable; index rebuilt when wallet file lists change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ownedFiles, trashFiles, receivedIndexQuery.data, sharedIndexQuery.data]);

  useEffect(() => {
    const navigation = driveSearch.consumeNavigation();
    if (navigation) {
      setCurrentView(navigation.view);
    }
  }, [driveSearch.pendingNavigation, driveSearch.consumeNavigation]);

  const filterFilesForSearch = useCallback(
    (files: OwnedFileView[]) => {
      const query = driveSearch.query.trim();
      if (!query) {
        return files;
      }
      return files.filter(
        (file) =>
          matchesDriveSearch(file.name, query) || matchesDriveSearch(file.blobId, query),
      );
    },
    [driveSearch.query],
  );

  const displayOwnedFiles = useMemo(
    () => filterFilesForSearch(ownedFiles),
    [ownedFiles, filterFilesForSearch],
  );

  const displayTrashFiles = useMemo(
    () => filterFilesForSearch(trashFiles),
    [trashFiles, filterFilesForSearch],
  );

  const refreshAll = useCallback(() => {

    reloadIndex();

    void ownedQuery.refetch();

    void queryClient.invalidateQueries({ queryKey: ["received-invitations"] });

  }, [ownedQuery, queryClient, reloadIndex]);



  const chainExecutor = useCallback(
    () => ({
      executeTransaction: async (tx: import("@mysten/sui/transactions").Transaction) => {
        const response = await signAndExecuteTransaction({ transaction: tx, chain: "sui:mainnet" });
        const digest =
          response && typeof response === "object" && "digest" in response
            ? String((response as { digest: string }).digest)
            : "";
        return { digest };
      },
    }),
    [signAndExecuteTransaction],
  );

  const handleRenewStorage = useCallback(
    async (files: OwnedFileView[]) => {
      if (!address) {
        toast.error("Connect your wallet to renew Walrus storage.");
        return;
      }

      const candidates = files
        .map((file) => toRenewalCandidate(file))
        .filter((entry): entry is NonNullable<typeof entry> => entry !== null);

      if (candidates.length === 0) {
        toast.error("This file cannot be renewed on Walrus.");
        return;
      }

      setRenewingObjectIds(new Set(candidates.map((file) => file.objectId)));
      const toastId = toast.loading(
        candidates.length === 1
          ? `Renewing storage rent for "${candidates[0].name}"…`
          : `Renewing storage rent for ${candidates.length} files…`,
      );

      try {
        const executor = chainExecutor();
        await renewWalrusStorageBatch({
          wallet: { address, executeTransaction: executor.executeTransaction },
          candidates,
        });

        toast.success(
          candidates.length === 1
            ? `"${candidates[0].name}" storage rent renewed — file restored to your drive.`
            : `Storage rent renewed for ${candidates.length} files — restored to your drive.`,
          { id: toastId, duration: 5000 },
        );

        await ownedQuery.refetch();
      } catch (error) {
        const message = error instanceof Error ? error.message : "Storage renewal failed.";
        toast.error("Could not renew storage rent.", { id: toastId, description: message });
        throw error;
      } finally {
        setRenewingObjectIds(new Set());
      }
    },
    [address, chainExecutor, ownedQuery],
  );

  const handleMoveToTrash = useCallback(

    async (payload: { files: OwnedFileView[]; folders: DriveFolder[] }) => {

      if (!address) {

        toast.error("Connect your wallet to delete files.");

        return;

      }

      const queue: OwnedFileView[] = [...payload.files];



      for (const folder of payload.folders) {

        for (const blobId of collectFolderFileBlobIds(folder.id)) {

          const match = ownedFiles.find((file) => file.blobId === blobId);

          if (match) {

            queue.push(match);

          }

        }

      }



      const uniqueFiles = Array.from(

        new Map(queue.map((file) => [file.blobId, file])).values(),

      );

      const toastId = toast.loading("Deleting on Sui…");

      try {

        await moveFilesToTrashWithChain(chainExecutor(), address, uniqueFiles);

        for (const folder of payload.folders) {

          moveFolderToTrash(folder.id);

        }

        reloadIndex();

        if (payload.folders.length > 0) {

          const folderCount = payload.folders.length;

          const fileCount = uniqueFiles.length;

          toast.success(

            `Moved ${folderCount} folder${folderCount === 1 ? "" : "s"} and ${fileCount} file${fileCount === 1 ? "" : "s"} to Trash.`,

            { id: toastId },

          );

        } else if (uniqueFiles.length === 1) {

          toast.success(`"${uniqueFiles[0].name}" deleted — moved to Trash on-chain.`, { id: toastId });

        } else if (uniqueFiles.length > 1) {

          toast.success(`${uniqueFiles.length} items deleted — moved to Trash on-chain.`, { id: toastId });

        } else {

          toast.dismiss(toastId);

        }

        await ownedQuery.refetch();
        window.setTimeout(() => void ownedQuery.refetch(), 2500);

      } catch (error) {

        const message = error instanceof Error ? error.message : "Delete failed.";

        toast.error("Could not delete.", { id: toastId, description: message });

      }

    },

    [address, ownedFiles, reloadIndex, ownedQuery, chainExecutor],

  );



  const handlePermanentDelete = useCallback(

    async (payload: { files: OwnedFileView[]; folders: DriveFolder[] }) => {

      const queue: OwnedFileView[] = [...payload.files];



      for (const folder of payload.folders) {

        for (const blobId of collectTrashBlobIdsForFolder(folder.id)) {

          const match = trashFiles.find((file) => file.blobId === blobId);

          if (match) {

            queue.push(match);

          }

        }

      }



      const uniqueFiles = Array.from(

        new Map(queue.map((file) => [file.blobId, file])).values(),

      );



      if (

        !address &&

        uniqueFiles.some((file) => file.isWalrusBlob && file.deletable)

      ) {

        toast.error("Connect your wallet to delete on-chain files.");

        return;

      }



      for (const file of uniqueFiles) {

        await permanentlyDeleteFile(file);

      }



      for (const folder of payload.folders) {

        permanentRemoveFolderFromDrive(folder.id);

      }



      reloadIndex();

      void ownedQuery.refetch();



      if (payload.folders.length > 0) {

        const folderCount = payload.folders.length;

        const fileCount = uniqueFiles.length;

        toast.success(

          `Permanently deleted ${folderCount} folder${folderCount === 1 ? "" : "s"} and ${fileCount} file${fileCount === 1 ? "" : "s"}.`,

        );

      }

    },

    [address, permanentlyDeleteFile, reloadIndex, trashFiles, ownedQuery],

  );



  const handleRestore = useCallback(

    async (payload: { files: OwnedFileView[]; folders: DriveFolder[] }) => {

      if (!address) {

        toast.error("Connect your wallet to restore files.");

        return;

      }

      let restoredCount = 0;

      const toastId = toast.loading("Restoring from Trash on Sui…");

      try {

        for (const folder of payload.folders) {

          if (restoreFolderFromTrash(folder.id)) {

            restoredCount += 1;

          }

        }

        if (payload.files.length > 0) {

          await restoreFilesFromTrashWithChain(chainExecutor(), address, payload.files);

          for (const file of payload.files) {

            if (restoreFileFromTrash(file.blobId)) {

              restoredCount += 1;

            } else if (file.inTrash) {

              restoredCount += 1;

            }

          }

        }

        reloadIndex();

        void ownedQuery.refetch();

        if (restoredCount === 0) {

          toast.error("Could not restore the selected items.", { id: toastId });

          return;

        }

        if (restoredCount === 1 && payload.files.length === 1 && payload.folders.length === 0) {

          toast.success(`"${payload.files[0].name}" restored to My Drive.`, { id: toastId });

        } else if (restoredCount === 1 && payload.folders.length === 1 && payload.files.length === 0) {

          toast.success(`"${payload.folders[0].name}" restored to My Drive.`, { id: toastId });

        } else {

          toast.success(`${restoredCount} item${restoredCount === 1 ? "" : "s"} restored to My Drive.`, { id: toastId });

        }

      } catch (error) {

        const message = error instanceof Error ? error.message : "Restore failed.";

        toast.error("Could not restore from Trash.", { id: toastId, description: message });

      }

    },

    [address, reloadIndex, ownedQuery, chainExecutor],

  );

  const handleRenameFile = useCallback(

    async (file: OwnedFileView, name: string) => {

      if (!address) {

        return;

      }

      const trimmed = name.trim();

      if (!trimmed) {

        return;

      }

      const fileId = await resolveDecendriveFileIdForBlob(address, file);

      if (!fileId) {

        renameFile(file.blobId, trimmed);

        reloadIndex();

        return;

      }

      const toastId = toast.loading("Saving name on Sui…");

      try {

        await syncDisplayNameOnChain(chainExecutor(), fileId, file.blobId, trimmed, file.mimeType);

        toast.success("Filename saved on-chain.", { id: toastId });

        reloadIndex();

        void ownedQuery.refetch();

      } catch (error) {

        const message = error instanceof Error ? error.message : "Rename failed.";

        toast.error("Could not save filename.", { id: toastId, description: message });

      }

    },

    [address, chainExecutor, reloadIndex, ownedQuery],

  );

  const handleRevokeShare = useCallback(
    async (item: import("@/components/drive/types").SharedOutItem) => {
      if (!address) {
        return;
      }
      const fileId = await resolveFileObjectIdForShareItem({
        invitationId: item.invitationId,
        fileObjectId: item.fileObjectId,
        blobId: item.blobId,
        sender: address,
      });
      if (!fileId) {
        throw new Error(
          "Could not find your on-chain File record for this share. Open the file in My Drive first, then try again.",
        );
      }
      if (fileId === item.invitationId) {
        throw new Error(
          "Revoke targeted the share invitation instead of your file record. Refresh the Shared tab and try again.",
        );
      }
      const toastId = toast.loading("Revoking access on Sui…");
      try {
        await syncRevokeRecipientOnChain(
          chainExecutor(),
          fileId,
          item.invitationId,
        );
        toast.success("Access revoked on-chain.", { id: toastId });
        void queryClient.invalidateQueries({ queryKey: ["shared-out"] });
        void queryClient.invalidateQueries({ queryKey: ["received"] });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Revoke failed.";
        toast.error("Could not revoke access.", { id: toastId, description: message });
        throw error;
      }
    },
    [address, chainExecutor, queryClient],
  );

  const handleRestoreShare = useCallback(
    async (item: import("@/components/drive/types").SharedOutItem) => {
      if (!address) {
        return;
      }
      const fileId = await resolveFileObjectIdForShareItem({
        invitationId: item.invitationId,
        fileObjectId: item.fileObjectId,
        blobId: item.blobId,
        sender: address,
      });
      if (!fileId) {
        throw new Error(
          "Could not find your on-chain File record for this share. Open the file in My Drive first, then try again.",
        );
      }
      if (fileId === item.invitationId) {
        throw new Error(
          "Restore targeted the share invitation instead of your file record. Refresh the Shared tab and try again.",
        );
      }
      const toastId = toast.loading("Restoring access on Sui…");
      try {
        await syncRestoreRecipientOnChain(
          chainExecutor(),
          fileId,
          item.invitationId,
        );
        toast.success("Access restored on-chain.", { id: toastId });
        void queryClient.invalidateQueries({ queryKey: ["shared-out"] });
        void queryClient.invalidateQueries({ queryKey: ["received"] });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Restore failed.";
        toast.error("Could not restore access.", { id: toastId, description: message });
        throw error;
      }
    },
    [address, chainExecutor, queryClient],
  );



  const handleDelete = useCallback(

    async (payload: { files: OwnedFileView[]; folders: DriveFolder[] }) => {

      if (currentView === "trash") {

        await handlePermanentDelete(payload);

      } else {

        await handleMoveToTrash(payload);

      }

    },

    [currentView, handleMoveToTrash, handlePermanentDelete],

  );



  return (

    <div className="min-h-screen bg-background">

      <TopNavbar />

      <div className="sticky top-14 z-30 border-b border-border/60 bg-background px-3 py-2 sm:top-16 lg:hidden">
        <MobileDriveNav
          currentView={currentView}
          expiredRentCount={expiredRentCount}
          onViewChange={setCurrentView}
        />
      </div>

      <div className="flex min-h-[calc(100vh-4rem)]">

        <Sidebar
          currentView={currentView}
          expiredRentCount={expiredRentCount}
          onViewChange={setCurrentView}
        />

        <main className="min-w-0 flex-1 space-y-4 p-3 sm:space-y-6 sm:p-4 md:p-6">

          <div className="mb-2 flex flex-col gap-2">

            <div className="flex flex-wrap items-center gap-3">

              <h1 className="text-xl font-semibold tracking-tight">{VIEW_HEADINGS[currentView]}</h1>

              <Badge variant="secondary">

                {account ? `Wallet: ${shortenAddress(account.address)}` : "Wallet: not connected"}

              </Badge>

            </div>

            {currentView === "trash" && (

              <p className="text-sm font-bold text-amber-200">

                Items in Trash are deleted permanently after {TRASH_RETENTION_DAYS} days.

              </p>

            )}

            {currentView !== "my-drive" && currentView !== "storage-rent" && (
              <ViewTrustBanner view={VIEW_TRUST_MAP[currentView]} />
            )}

          </div>

          {currentView === "my-drive" && (
            <>
              <ViewTrustBanner view="upload" className="mb-0" />
              <UploadZone
                uploadPage={uploadPage}
                onUploadPageChange={setUploadPage}
                onUploadComplete={() => {
                  setCurrentView("my-drive");
                  refreshAll();
                }}
              />
            </>
          )}

          {currentView === "my-drive" && (

            <DriveExplorer

              view="my-drive"

              files={displayOwnedFiles}
              highlightBlobId={driveSearch.highlightBlobId}

              isLoading={!ownedQuery.isFetched}

              isConnected={isConnected}

              viewMode={viewMode}

              onViewModeChange={setViewMode}

              onPreview={handlePreview}

              onShare={(file) => setShareTarget({ type: "file", file })}

              onShareFolder={(folder, folderFiles) =>

                setShareTarget({ type: "folder", folder, files: folderFiles })

              }

              onDelete={handleDelete}

              onRenameFile={handleRenameFile}

              onIndexChange={reloadIndex}
              page={myDrivePage}
              pageSize={listPageSize}
              onPageChange={setMyDrivePage}
              onPageSizeChange={handleListPageSizeChange}
            />

          )}



          {currentView === "storage-rent" && (
            <>
              <ViewTrustBanner view="storage-rent" className="mb-0" />
              <StorageRentPanel
                files={decoratedOwned}
                isLoading={!ownedQuery.isFetched}
                isConnected={isConnected}
                isRenewing={renewingObjectIds.size > 0}
                onRenew={handleRenewStorage}
                onPreview={handlePreview}
                page={storageRentPage}
                pageSize={listPageSize}
                onPageChange={setStorageRentPage}
                onPageSizeChange={handleListPageSizeChange}
              />
            </>
          )}



          {currentView === "trash" && (

            <DriveExplorer

              view="trash"

              files={displayTrashFiles}
              highlightBlobId={driveSearch.highlightBlobId}

              trashFolders={trashFolders}

              isLoading={!ownedQuery.isFetched}

              isConnected={isConnected}

              viewMode={viewMode}

              onViewModeChange={setViewMode}

              onPreview={handlePreview}

              onDelete={handleDelete}

              onRestore={handleRestore}

              onIndexChange={reloadIndex}
              page={trashPage}
              pageSize={listPageSize}
              onPageChange={setTrashPage}
              onPageSizeChange={handleListPageSizeChange}
            />

          )}



          {currentView === "shared" && (

            <SharedOutPanel
              sender={address}
              page={sharedOutPage}
              pageSize={listPageSize}
              onPageChange={setSharedOutPage}
              onPageSizeChange={handleListPageSizeChange}
              onRevoke={handleRevokeShare}
              onRestore={handleRestoreShare}
            />

          )}



          {currentView === "received" && (

            <ReceivedPanel

              onPreview={handlePreview}

              onAccepted={refreshAll}

              pendingPage={pendingPage}
              receivedPage={receivedPage}
              pageSize={listPageSize}
              onPendingPageChange={setPendingPage}
              onReceivedPageChange={setReceivedPage}
              onPageSizeChange={handleListPageSizeChange}
            />

          )}



          <DriveStateSync />

          <PreviewModal preview={preview} onClose={closePreview} />



          <ShareModal

            open={Boolean(shareTarget)}

            target={shareTarget}

            onOpenChange={(open) => {

              if (!open) {

                setShareTarget(null);

              }

            }}

            onShared={() => {
              refreshAll();
              if (address) {
                queryClient.setQueryData(["shared-out-bust", address], true);
                clearPanelCache(`shared-out:${address}:1`);
              }
              void queryClient.invalidateQueries({ queryKey: ["shared-out"] });
              void queryClient.invalidateQueries({ queryKey: ["shared-index"] });
              void queryClient.invalidateQueries({ queryKey: ["received-index"] });
              void queryClient.invalidateQueries({ queryKey: ["received-invitations"] });
            }}

          />

        </main>

      </div>

    </div>

  );

}

