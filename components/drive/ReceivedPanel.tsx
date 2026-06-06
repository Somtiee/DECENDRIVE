"use client";

import { format } from "date-fns";
import {
  Check,
  Download,
  Eye,
  FileIcon,
  FolderInput,
  FolderMinus,
  Loader2,
  X,
} from "lucide-react";
import { useCurrentAccount, useSignAndExecuteTransaction } from "@mysten/dapp-kit";
import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { Pagination } from "@/components/drive/Pagination";
import type { OwnedFileView, ShareInvitationView } from "@/components/drive/types";
import { useFileActions } from "@/components/drive/use-file-actions";
import type { PreviewTarget } from "@/components/drive/PreviewModal";
import { recordReceived } from "@/lib/drive/activity";
import type { PageSizeOption, PaginationMeta } from "@/lib/drive/pagination";
import {
  addReceivedToMyDrive,
  isSavedReceived,
  removeSavedReceived,
} from "@/lib/drive/saved-received";
import { FILE_INDEX_EVENT } from "@/lib/drive/file-metadata";
import { AccessRevokedDialog } from "@/components/drive/AccessRevokedDialog";
import { acceptShareInvitation, declineShareInvitation } from "@/lib/sui/contract";
import { shareAccessLabelFromSettings } from "@/lib/drive/share-access";
import { TxProofLink } from "@/components/drive/TxProofLink";
import { TrustBadge } from "@/components/drive/trust";
import { Button } from "@/components/ui/button";
import { applyRevokeStatusToInvites } from "@/lib/drive/enrich-received-revoke";
import {
  clearPanelCache,
  readReceivedPanelCache,
  writeReceivedPanelCache,
} from "@/lib/drive/panel-cache";
import { shortenAddress } from "@/lib/utils";

type ReceivedQueryData = {
  pending: { items: ShareInvitationView[]; pagination: PaginationMeta };
  received: { items: ShareInvitationView[]; pagination: PaginationMeta };
  error?: string;
  warning?: string;
  stale?: boolean;
};

type ReceivedRefreshOptions = {
  bustCache?: boolean;
  action?: "accepted" | "declined";
  invite?: ShareInvitationView;
};

function patchInviteAction(
  current: ReceivedQueryData,
  action: "accepted" | "declined",
  invite: ShareInvitationView,
): ReceivedQueryData {
  const pendingItems = current.pending.items.filter((item) => item.objectId !== invite.objectId);
  const pendingTotal = Math.max(0, current.pending.pagination.total - 1);

  if (action === "declined") {
    return {
      ...current,
      stale: false,
      warning: undefined,
      pending: {
        ...current.pending,
        items: pendingItems,
        pagination: {
          ...current.pending.pagination,
          total: pendingTotal,
        },
      },
    };
  }

  const acceptedInvite: ShareInvitationView = {
    ...invite,
    status: "accepted",
    acceptedAt: Date.now(),
  };

  return {
    ...current,
    stale: false,
    warning: undefined,
    pending: {
      ...current.pending,
      items: pendingItems,
      pagination: {
        ...current.pending.pagination,
        total: pendingTotal,
      },
    },
    received: {
      ...current.received,
      items: [acceptedInvite, ...current.received.items.filter((item) => item.objectId !== invite.objectId)],
      pagination: {
        ...current.received.pagination,
        total: current.received.pagination.total + 1,
      },
    },
  };
}

function emptyReceivedPage(page: number, pageSize: number) {
  return {
    items: [] as ShareInvitationView[],
    pagination: { page, pageSize, total: 0, totalPages: 1 },
  };
}

function applyInviteAction(
  current: ReceivedQueryData | undefined,
  action: "accepted" | "declined",
  invite: ShareInvitationView,
  pendingPage: number,
  receivedPage: number,
  pageSize: number,
): ReceivedQueryData {
  if (!current) {
    if (action === "declined") {
      return {
        pending: emptyReceivedPage(pendingPage, pageSize),
        received: emptyReceivedPage(receivedPage, pageSize),
        stale: false,
      };
    }
    const acceptedInvite: ShareInvitationView = {
      ...invite,
      status: "accepted",
      acceptedAt: Date.now(),
    };
    return {
      pending: emptyReceivedPage(pendingPage, pageSize),
      received: {
        items: [acceptedInvite],
        pagination: { page: receivedPage, pageSize, total: 1, totalPages: 1 },
      },
      stale: false,
    };
  }
  return patchInviteAction(current, action, invite);
}

type ReceivedPanelProps = {
  onPreview: (preview: PreviewTarget) => void;
  onAccepted?: () => void;
  onInviteAccepted?: () => void;
  pendingPage: number;
  receivedPage: number;
  pageSize: number;
  onPendingPageChange: (page: number) => void;
  onReceivedPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: PageSizeOption) => void;
};

function friendlyLoadError(error: unknown) {
  const message = error instanceof Error ? error.message : "";
  if (message.includes("429") || message.toLowerCase().includes("rate") || message.includes("busy")) {
    return "Sui network is busy. Your files are still on-chain — wait a few seconds and tap Retry.";
  }
  if (message) {
    return message;
  }
  return "Could not refresh received files. Please try again.";
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

function invitationToFileView(invite: ShareInvitationView, account: string): OwnedFileView {
  const hasShareKey = Boolean(invite.keyWrapper?.length);
  return {
    objectId: invite.walrusObjectId ?? invite.objectId,
    name: invite.name,
    size: invite.size,
    date: invite.date,
    blobId: invite.blobId,
    walrusUrl: invite.walrusUrl,
    owner: invite.sender,
    isOwner: false,
    canAccess:
      invite.canView && (invite.status === "accepted" || (invite.status === "pending" && hasShareKey)),
    encryptionKeyHash: invite.encryptionKeyHash,
    mimeType: invite.mimeType,
    shareKeyWrapper: invite.keyWrapper,
    sharePermissions: {
      canView: invite.canView,
      canDownload: invite.canDownload,
    },
    accessRevoked: invite.accessRevoked,
    shareStatus: invite.status === "pending" ? "pending" : "accepted",
    shareInvitationId: invite.objectId,
    decendriveFileId: invite.fileObjectId,
    accessList: [],
  };
}

function InviteRow({
  invite,
  account,
  onPreview,
  onRefresh,
}: {
  invite: ShareInvitationView;
  account: string;
  onPreview: (p: PreviewTarget) => void;
  onRefresh: (options?: ReceivedRefreshOptions) => Promise<void>;
}) {
  const { mutateAsync: signAndExecuteTransaction } = useSignAndExecuteTransaction();
  const [revokedDialogOpen, setRevokedDialogOpen] = useState(false);
  const { busyBlobId, openPreview, download } = useFileActions(onPreview, {
    recipientAddress: account,
    onAccessRevoked: () => setRevokedDialogOpen(true),
  });
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const file = invitationToFileView(invite, account);
  const busy = busyBlobId === invite.blobId || busyAction === invite.objectId;
  const accessLabel = invite.accessRevoked
    ? "Access revoked"
    : shareAccessLabelFromSettings({
        mode: invite.canView && invite.canDownload ? "view-download" : "view-only",
        canView: invite.canView,
        canDownload: invite.canDownload,
      });

  const guardRevoked = () => {
    if (invite.accessRevoked) {
      setRevokedDialogOpen(true);
      return true;
    }
    return false;
  };

  const runProtectedAction = (action: "preview" | "download") => {
    if (guardRevoked()) {
      return;
    }
    if (action === "preview") {
      void openPreview(file);
      return;
    }
    void download(file);
  };
  const [savedToDrive, setSavedToDrive] = useState(() => isSavedReceived(invite.blobId));

  useEffect(() => {
    const syncSaved = () => setSavedToDrive(isSavedReceived(invite.blobId));
    syncSaved();
    window.addEventListener(FILE_INDEX_EVENT, syncSaved);
    return () => window.removeEventListener(FILE_INDEX_EVENT, syncSaved);
  }, [invite.blobId]);

  const accept = async () => {
    if (guardRevoked()) {
      return;
    }
    setBusyAction(invite.objectId);
    try {
      const result = await acceptShareInvitation(
        {
          executeTransaction: async (tx) => {
            const response = await signAndExecuteTransaction({
              transaction: tx,
              chain: "sui:mainnet",
            });
            return { digest: getDigestFromResult(response) };
          },
        },
        invite.objectId,
        Date.now(),
      );
      recordReceived(invite.blobId, invite.name, invite.sender, result.digest);
      toast.success(`Accepted "${invite.name}".`, {
        description: (
          <span className="inline-flex flex-wrap items-center gap-1">
            On-chain proof: <TxProofLink digest={result.digest} />
          </span>
        ),
      });
      void onRefresh({ bustCache: true, action: "accepted", invite });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Accept failed.";
      toast.error(message);
    } finally {
      setBusyAction(null);
    }
  };

  const decline = async () => {
    setBusyAction(invite.objectId);
    try {
      await declineShareInvitation(
        {
          executeTransaction: async (tx) => {
            const response = await signAndExecuteTransaction({
              transaction: tx,
              chain: "sui:mainnet",
            });
            return { digest: getDigestFromResult(response) };
          },
        },
        invite.objectId,
      );
      toast.success("Invitation declined.");
      void onRefresh({ bustCache: true, action: "declined", invite });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Decline failed.";
      toast.error(message);
    } finally {
      setBusyAction(null);
    }
  };

  const moveToMyDrive = () => {
    if (guardRevoked()) {
      return;
    }
    if (!invite.keyWrapper) {
      toast.error("This invitation has no decryption key yet.");
      return;
    }
    if (addReceivedToMyDrive(invite)) {
      toast.success(`"${invite.name}" added to My Drive.`);
      void onRefresh({ bustCache: true });
    } else {
      toast.message(`"${invite.name}" is already in My Drive.`);
    }
  };

  const removeFromMyDrive = () => {
    if (!invite.blobId) {
      return;
    }
    removeSavedReceived(invite.blobId);
    toast.success(`"${invite.name}" removed from My Drive.`);
    void onRefresh({ bustCache: true });
  };

  return (
    <div
      className={`flex flex-wrap items-center justify-between gap-3 rounded-lg border px-4 py-3 ${
        invite.accessRevoked
          ? "border-rose-500/30 bg-rose-500/5"
          : "border-border/70 bg-background/40"
      }`}
    >
      <div className="flex min-w-0 items-center gap-3">
        {busy ? (
          <Loader2 className="h-5 w-5 shrink-0 animate-spin text-muted-foreground" />
        ) : (
          <FileIcon className="h-5 w-5 shrink-0 text-muted-foreground" />
        )}
        <div className="min-w-0">
          <p className="truncate font-medium">{invite.name}</p>
          <p className="text-xs text-muted-foreground">
            From {shortenAddress(invite.sender)} ·{" "}
            {format(new Date(invite.createdAt), "MMM d, yyyy")}
          </p>
          <p className="mt-1 flex flex-wrap items-center gap-2 text-[10px] text-muted-foreground">
            <span>
              Access: {accessLabel}
              {invite.status === "pending" && !invite.accessRevoked ? " · preview before accept" : ""}
            </span>
            {invite.status === "pending" ? (
              <span className="rounded-full border border-amber-500/40 bg-amber-500/15 px-2 py-0.5 text-[10px] font-medium text-amber-200">
                Pending
              </span>
            ) : invite.status === "accepted" ? (
              <span className="rounded-full border border-emerald-500/40 bg-emerald-500/15 px-2 py-0.5 text-[10px] font-medium text-emerald-300">
                Received
              </span>
            ) : null}
            {invite.accessRevoked ? (
              <span className="rounded-full border border-rose-500/40 bg-rose-500/15 px-2 py-0.5 text-[10px] font-medium text-rose-300">
                Revoked
              </span>
            ) : null}
          </p>
          <div className="mt-2 flex flex-wrap gap-1">
            <TrustBadge kind="encrypted" />
            <TrustBadge kind="onchain" />
            {invite.keyWrapper ? <TrustBadge kind="wallet" /> : null}
          </div>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {invite.status === "accepted" && invite.keyWrapper && !savedToDrive && !invite.accessRevoked && (
          <Button type="button" size="sm" variant="outline" disabled={busy} onClick={moveToMyDrive}>
            <FolderInput className="mr-2 h-4 w-4" />
            Move to My Drive
          </Button>
        )}
        {invite.status === "accepted" && invite.keyWrapper && savedToDrive && !invite.accessRevoked && (
          <Button type="button" size="sm" variant="outline" disabled={busy} onClick={removeFromMyDrive}>
            <FolderMinus className="mr-2 h-4 w-4" />
            Remove from My Drive
          </Button>
        )}
        {invite.accessRevoked ? (
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="border-rose-500/40 text-rose-200"
            onClick={() => setRevokedDialogOpen(true)}
          >
            Access revoked
          </Button>
        ) : null}
        {!invite.accessRevoked && invite.canView && invite.keyWrapper && (
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={busy}
            onClick={() => runProtectedAction("preview")}
          >
            <Eye className="mr-2 h-4 w-4" />
            {invite.status === "pending" ? "Preview" : "Open"}
          </Button>
        )}
        {!invite.accessRevoked && invite.canDownload && invite.keyWrapper && (
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={busy}
            onClick={() => runProtectedAction("download")}
          >
            <Download className="mr-2 h-4 w-4" />
            Download
          </Button>
        )}
        {!invite.accessRevoked && invite.status === "pending" ? (
          <>
            <Button type="button" size="sm" disabled={busy} onClick={() => void accept()}>
              <Check className="mr-2 h-4 w-4" />
              Accept
            </Button>
            <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => void decline()}>
              <X className="mr-2 h-4 w-4" />
              Decline
            </Button>
          </>
        ) : null}
      </div>
      <AccessRevokedDialog
        open={revokedDialogOpen}
        fileName={invite.name}
        onClose={() => setRevokedDialogOpen(false)}
      />
    </div>
  );
}

function Section({
  title,
  count,
  items,
  pagination,
  onPageChange,
  onPageSizeChange,
  account,
  onPreview,
  onRefresh,
  emptyMessage,
}: {
  title: string;
  count: number;
  items: ShareInvitationView[];
  pagination: PaginationMeta;
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: PageSizeOption) => void;
  account: string;
  onPreview: (p: PreviewTarget) => void;
  onRefresh: (options?: ReceivedRefreshOptions) => Promise<void>;
  emptyMessage: string;
}) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">
          {title}{" "}
          <span className="font-normal text-muted-foreground">({count})</span>
        </h3>
      </div>
      {items.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border/70 px-4 py-8 text-center text-sm text-muted-foreground">
          {emptyMessage}
        </p>
      ) : (
        <div className="space-y-2">
          {items.map((invite) => (
            <InviteRow
              key={invite.objectId}
              invite={invite}
              account={account}
              onPreview={onPreview}
              onRefresh={onRefresh}
            />
          ))}
        </div>
      )}
      <Pagination
        pagination={pagination}
        onPageChange={onPageChange}
        onPageSizeChange={onPageSizeChange}
      />
    </div>
  );
}

export function ReceivedPanel({
  onPreview,
  onAccepted,
  onInviteAccepted,
  pendingPage,
  receivedPage,
  pageSize,
  onPendingPageChange,
  onReceivedPageChange,
  onPageSizeChange,
}: ReceivedPanelProps) {
  const account = useCurrentAccount();
  const address = account?.address;
  const queryClient = useQueryClient();
  const bustCacheRef = useRef(false);
  const initialLiveSyncRef = useRef(true);
  const panelCacheKey = address ? `received:${address}` : null;

  if (!address) {
    initialLiveSyncRef.current = true;
  }
  const queryKey = ["received-invitations", address, pendingPage, receivedPage, pageSize] as const;

  const cachedSnapshot = useMemo(() => {
    if (!panelCacheKey) {
      return undefined;
    }
    return readReceivedPanelCache(panelCacheKey);
  }, [panelCacheKey]);

  const query = useQuery({
    queryKey,
    enabled: Boolean(address),
    staleTime: 8_000,
    gcTime: 30 * 60_000,
    retry: 2,
    retryDelay: (attempt) => Math.min(4000, 1000 * 2 ** attempt),
    refetchOnWindowFocus: true,
    refetchInterval: () => (typeof document !== "undefined" && document.hidden ? false : 10_000),
    placeholderData: keepPreviousData,
    initialData: cachedSnapshot as ReceivedQueryData | undefined,
    initialDataUpdatedAt: cachedSnapshot ? Date.now() - 8_000 : undefined,
    queryFn: async () => {
      const shouldRefresh = bustCacheRef.current || initialLiveSyncRef.current;
      if (initialLiveSyncRef.current) {
        initialLiveSyncRef.current = false;
      }
      bustCacheRef.current = false;
      const refreshParam = shouldRefresh ? "&refresh=1" : "";
      const response = await fetch(
        `/api/files/received?recipient=${encodeURIComponent(address ?? "")}&pendingPage=${pendingPage}&receivedPage=${receivedPage}&pageSize=${pageSize}${refreshParam}`,
        { cache: "no-store" },
      );
      const data = (await response.json()) as ReceivedQueryData;
      if (!response.ok) {
        throw new Error(data.error ?? "Failed to load received invitations.");
      }
      const needsClientRevokeEnrich = Boolean(data.stale);
      const merged: ReceivedQueryData = {
        ...data,
        pending: {
          ...data.pending,
          items: needsClientRevokeEnrich
            ? await applyRevokeStatusToInvites(data.pending.items, address ?? "")
            : data.pending.items,
        },
        received: {
          ...data.received,
          items: needsClientRevokeEnrich
            ? await applyRevokeStatusToInvites(data.received.items, address ?? "")
            : data.received.items,
        },
      };
      if (panelCacheKey) {
        writeReceivedPanelCache(panelCacheKey, merged);
      }
      return merged;
    },
  });

  const scheduleBackgroundSync = (delaysMs: number[]) => {
    for (const delayMs of delaysMs) {
      window.setTimeout(() => {
        bustCacheRef.current = true;
        void query.refetch();
      }, delayMs);
    }
  };

  const refresh = async (options: ReceivedRefreshOptions = {}) => {
    const { bustCache = false, action, invite } = options;

    if (action && invite) {
      queryClient.setQueriesData<ReceivedQueryData>(
        { queryKey: ["received-invitations", address], exact: false },
        (current) =>
          applyInviteAction(
            current,
            action,
            invite,
            pendingPage,
            receivedPage,
            pageSize,
          ),
      );
      const optimistic = queryClient.getQueryData<ReceivedQueryData>(queryKey);
      if (optimistic && panelCacheKey) {
        writeReceivedPanelCache(panelCacheKey, optimistic);
      }
      if (action === "accepted") {
        onInviteAccepted?.();
      }
      onAccepted?.();
      bustCacheRef.current = true;
      scheduleBackgroundSync([1200, 4000, 9000]);
      void query.refetch();
      return;
    }

    if (bustCache) {
      if (panelCacheKey) {
        clearPanelCache(panelCacheKey);
      }
      bustCacheRef.current = true;
    }

    onAccepted?.();
    await query.refetch();
  };

  if (!address) {
    return (
      <p className="rounded-xl border border-border/70 bg-card/70 px-6 py-12 text-center text-sm text-muted-foreground">
        Connect your Sui wallet to see files shared with you.
      </p>
    );
  }

  if (!query.data && !query.isFetched) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-border/70 bg-card/70 py-20 text-sm text-muted-foreground">
        <Loader2 className="h-6 w-6 animate-spin text-sky-400" />
        <p className="font-medium text-foreground">Loading share invitations…</p>
        <p className="max-w-sm text-center text-xs">
          Reading on-chain invitations sent to your wallet. This usually takes a few seconds.
        </p>
      </div>
    );
  }

  const pending = query.data?.pending ?? {
    items: [],
    pagination: { page: 1, pageSize, total: 0, totalPages: 1 },
  };
  const received = query.data?.received ?? {
    items: [],
    pagination: { page: 1, pageSize, total: 0, totalPages: 1 },
  };

  const showLoadError = query.isError && !query.data;
  const showStaleBanner = Boolean(query.data?.stale && query.data?.warning);

  if (showLoadError) {
    return (
      <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-6 text-center">
        <p className="text-sm text-amber-100">
          We could not reach Sui mainnet right now. Your share invitations are still in your wallet —
          nothing was deleted.
        </p>
        <p className="mt-2 text-xs text-amber-200/90">{friendlyLoadError(query.error)}</p>
        <Button type="button" size="sm" className="mt-4" onClick={() => void query.refetch()}>
          Retry
        </Button>
      </div>
    );
  }

  return (
    <section className="space-y-8 rounded-xl border border-border/70 bg-card/70 p-4 md:p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">
          {query.isFetching
            ? "Updating from Sui…"
            : "Accept or decline pending invitations below."}
        </p>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={query.isFetching}
          onClick={() => void refresh({ bustCache: true })}
        >
          {query.isFetching ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
          Refresh
        </Button>
      </div>
      {showStaleBanner && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-500/35 bg-amber-500/10 px-3 py-2 text-xs text-amber-100">
          <span>
            {query.data?.warning ??
              "Showing your last loaded list — Sui RPC is busy. Tap Retry sync in a moment."}
          </span>
          <Button type="button" size="sm" variant="outline" onClick={() => void query.refetch()}>
            Retry sync
          </Button>
        </div>
      )}
      <Section
        title="Pending receives"
        count={pending.pagination.total}
        items={pending.items}
        pagination={pending.pagination}
        onPageChange={onPendingPageChange}
        onPageSizeChange={onPageSizeChange}
        account={address}
        onPreview={onPreview}
        onRefresh={refresh}
        emptyMessage="No pending invitations. When someone shares to your wallet, preview or download here, then accept to keep the file in Received."
      />
      <Section
        title="Received"
        count={received.pagination.total}
        items={received.items}
        pagination={received.pagination}
        onPageChange={onReceivedPageChange}
        onPageSizeChange={onPageSizeChange}
        account={address}
        onPreview={onPreview}
        onRefresh={refresh}
        emptyMessage="Accepted shares appear here. Open or download with your connected wallet."
      />
    </section>
  );
}
