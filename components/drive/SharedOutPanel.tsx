"use client";

import { format } from "date-fns";
import { Ban, Loader2, RefreshCw, RotateCcw, Share2, Wallet } from "lucide-react";
import { useCurrentAccount } from "@mysten/dapp-kit";
import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { ShareAccessConfirmDialog, type ShareAccessConfirmAction } from "@/components/drive/ShareAccessConfirmDialog";
import { TxProofLink } from "@/components/drive/TxProofLink";
import type { SharedOutItem } from "@/components/drive/types";
import { TrustBadge } from "@/components/drive/trust";
import { Pagination } from "@/components/drive/Pagination";
import {
  addLocalRevokedInvitation,
  isInvitationLocallyRevoked,
  removeLocalRevokedInvitation,
} from "@/lib/drive/share-revoke";
import {
  clearPanelCache,
  readNonEmptyPanelCache,
  writePanelCache,
  writePanelCacheIfNonEmpty,
} from "@/lib/drive/panel-cache";
import { shareAccessLabel } from "@/lib/sui/share-crypto";
import { Button } from "@/components/ui/button";
import type { PageSizeOption } from "@/lib/drive/pagination";

type SharedOutQueryData = {
  items: SharedOutItem[];
  pagination: { page: number; pageSize: number; total: number; totalPages: number };
  warning?: string;
  stale?: boolean;
};

type SharedOutPanelProps = {
  sender: string | null;
  page: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: PageSizeOption) => void;
  onRevoke?: (item: SharedOutItem) => Promise<void>;
  onRestore?: (item: SharedOutItem) => Promise<void>;
};

function withLocalRevokeState(items: SharedOutItem[]): SharedOutItem[] {
  return items.map((item) => {
    const revoked = item.accessRevoked || isInvitationLocallyRevoked(item.invitationId);
    return {
      ...item,
      accessRevoked: revoked,
      permissions: revoked ? 0 : item.permissions,
    };
  });
}

export function SharedOutPanel({
  sender,
  page,
  pageSize,
  onPageChange,
  onPageSizeChange,
  onRevoke,
  onRestore,
}: SharedOutPanelProps) {
  const account = useCurrentAccount();
  const queryClient = useQueryClient();
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const [restoringId, setRestoringId] = useState<string | null>(null);
  const [confirmTarget, setConfirmTarget] = useState<{
    item: SharedOutItem;
    action: ShareAccessConfirmAction;
  } | null>(null);

  const panelCacheKey = sender ? `shared-out:${sender}:${page}:${pageSize}` : null;

  const cachedSnapshot = useMemo(() => {
    if (!panelCacheKey) {
      return undefined;
    }
    const cached = readNonEmptyPanelCache<SharedOutQueryData>(panelCacheKey);
    if (!cached) {
      return undefined;
    }
    return { ...cached, items: withLocalRevokeState(cached.items) };
  }, [panelCacheKey]);

  useEffect(() => {
    if (!sender) {
      return;
    }
    queryClient.setQueryData(["shared-out-bust", sender], true);
  }, [sender, queryClient]);

  const queryKey = ["shared-out", sender, page, pageSize] as const;

  const query = useQuery({
    queryKey,
    enabled: Boolean(sender),
    staleTime: 8_000,
    gcTime: 30 * 60_000,
    placeholderData: keepPreviousData,
    refetchOnWindowFocus: true,
    refetchInterval: () => (typeof document !== "undefined" && document.hidden ? false : 12_000),
    retry: 2,
    queryFn: async ({ queryKey }) => {
      const [, querySender, queryPage, queryPageSize] = queryKey;
      const bustCache = queryClient.getQueryData<boolean>(["shared-out-bust", querySender]) ?? false;
      const refreshParam = bustCache ? "&refresh=1" : "";
      const response = await fetch(
        `/api/files/shared-out?sender=${querySender}&page=${queryPage}&pageSize=${queryPageSize}${refreshParam}`,
        { cache: "no-store" },
      );
      const data = (await response.json()) as SharedOutQueryData;
      if (!response.ok) {
        throw new Error("Failed to load shared files.");
      }
      const merged = { ...data, items: withLocalRevokeState(data.items) };
      if (panelCacheKey) {
        writePanelCacheIfNonEmpty(panelCacheKey, merged);
      }
      if (bustCache) {
        queryClient.setQueryData(["shared-out-bust", querySender], false);
      }
      return merged;
    },
  });

  const patchItemRevoked = (item: SharedOutItem, revoked: boolean) => {
    if (!sender) {
      return;
    }
    queryClient.setQueryData<SharedOutQueryData>(queryKey, (current) => {
      if (!current) {
        return current;
      }
      const next = {
        ...current,
        items: current.items.map((entry) =>
          entry.invitationId === item.invitationId
            ? {
                ...entry,
                accessRevoked: revoked,
                permissions: revoked ? 0 : entry.permissions > 0 ? entry.permissions : 3,
              }
            : entry,
        ),
      };
      if (panelCacheKey) {
        writePanelCache(panelCacheKey, next);
      }
      return next;
    });
  };

  const requestRefresh = (bustCache = true) => {
    if (!sender) {
      return;
    }
    if (bustCache && panelCacheKey) {
      clearPanelCache(panelCacheKey);
    }
    if (bustCache) {
      queryClient.setQueryData(["shared-out-bust", sender], true);
    }
    void query.refetch();
  };

  const runConfirmedAction = async () => {
    if (!confirmTarget) {
      return;
    }
    const { item, action } = confirmTarget;
    const handler = action === "revoke" ? onRevoke : onRestore;
    if (!handler) {
      return;
    }

    const revoked = action === "revoke";
    setConfirmTarget(null);

    if (revoked) {
      addLocalRevokedInvitation(item.invitationId);
      setRevokingId(item.invitationId);
    } else {
      removeLocalRevokedInvitation(item.invitationId);
      setRestoringId(item.invitationId);
    }
    patchItemRevoked(item, revoked);
    toast.success(revoked ? "Access revoked." : "Access restored.");

    try {
      await handler(item);
      requestRefresh();
    } catch (error) {
      if (revoked) {
        removeLocalRevokedInvitation(item.invitationId);
      } else {
        addLocalRevokedInvitation(item.invitationId);
      }
      patchItemRevoked(item, !revoked);
      const message = error instanceof Error ? error.message : `${action} failed.`;
      toast.error(message);
    } finally {
      setRevokingId(null);
      setRestoringId(null);
    }
  };

  if (!sender) {
    return (
      <p className="rounded-xl border border-border/70 bg-card/70 px-6 py-12 text-center text-sm text-muted-foreground">
        Connect your wallet to see outgoing shares.
      </p>
    );
  }

  if (!query.isFetched) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-border/70 bg-card/70 py-20 text-sm text-muted-foreground">
        <Loader2 className="h-6 w-6 animate-spin text-sky-400" />
        <p className="font-medium text-foreground">Loading outgoing shares…</p>
        <p className="max-w-sm text-center text-xs">
          Reading on-chain share invitations from Sui mainnet.
        </p>
      </div>
    );
  }

  const items = query.data?.items ?? [];
  const pagination = query.data?.pagination ?? {
    page: 1,
    pageSize,
    total: 0,
    totalPages: 1,
  };
  const confirmBusy =
    Boolean(confirmTarget) &&
    (revokingId === confirmTarget?.item.invitationId ||
      restoringId === confirmTarget?.item.invitationId);

  return (
    <section className="space-y-4 rounded-xl border border-border/70 bg-card/70 p-4 md:p-6">
      {query.isRefetching && (
        <p className="flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Syncing with Sui…
        </p>
      )}
      {"warning" in (query.data ?? {}) && query.data?.warning ? (
        <div className="rounded-lg border border-amber-500/35 bg-amber-500/10 px-3 py-2 text-xs text-amber-100">
          {query.data.warning}
        </div>
      ) : null}

      <div className="flex flex-wrap items-start justify-between gap-3 rounded-lg border border-sky-500/25 bg-sky-500/5 px-4 py-3">
        <div>
          <h3 className="text-sm font-semibold text-foreground">Outgoing shares</h3>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            On-chain invitations sent to recipient wallets. Use Revoke to remove a recipient&apos;s
            access, or Restore access to undo a revocation. Shares stay listed even if you delete
            the file from My Drive.
          </p>
        </div>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={query.isRefetching}
          onClick={() => requestRefresh(true)}
        >
          {query.isRefetching ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="mr-2 h-4 w-4" />
          )}
          Refresh
        </Button>
      </div>

      {items.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border/70 py-12 text-center text-sm text-muted-foreground">
          You have not shared any files yet. Open a file in My Drive and choose Share.
        </p>
      ) : (
        <ul className="space-y-2">
          {items.map((item) => {
            const revoking = revokingId === item.invitationId;
            const restoring = restoringId === item.invitationId;

            return (
              <li
                key={`${item.invitationId}-${item.createdAt}`}
                className={`flex flex-wrap items-center justify-between gap-3 rounded-lg border px-4 py-3 ${
                  item.accessRevoked
                    ? "border-rose-500/30 bg-rose-500/5"
                    : "border-border/50 bg-background/30"
                }`}
              >
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
                    <Share2 className="h-4 w-4 shrink-0 text-primary" />
                    <span className="truncate">{item.name}</span>
                    {item.accessRevoked && (
                      <span className="rounded-full border border-rose-500/50 bg-rose-500/15 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-rose-200">
                        Revoked
                      </span>
                    )}
                    {!item.accessRevoked && item.status === "accepted" && (
                      <span className="share-received-blink rounded-full border border-emerald-500/40 bg-emerald-500/10 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide">
                        Received
                      </span>
                    )}
                    {!item.accessRevoked && item.status === "pending" && (
                      <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[11px] font-medium text-amber-200">
                        Pending
                      </span>
                    )}
                  </p>
                  <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                    <Wallet className="h-3 w-3 shrink-0" />
                    To {item.recipient.slice(0, 8)}…{item.recipient.slice(-6)}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Sent {format(new Date(item.createdAt), "MMM d, yyyy · h:mm a")}
                    {item.status === "accepted" && item.acceptedAt > 0
                      ? ` · accepted ${format(new Date(item.acceptedAt), "MMM d, yyyy · h:mm a")}`
                      : ""}
                  </p>
                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    <span
                      className={`text-[10px] ${
                        item.accessRevoked ? "font-medium text-rose-300" : "text-muted-foreground"
                      }`}
                    >
                      {item.accessRevoked ? "Access revoked" : shareAccessLabel(item.permissions)}
                    </span>
                    <TrustBadge kind="onchain" />
                    <TrustBadge kind="encrypted" />
                  </div>
                  {item.txDigest ? (
                    <p className="mt-2 text-xs">
                      Proof: <TxProofLink digest={item.txDigest} />
                    </p>
                  ) : null}
                </div>

                <div className="flex flex-wrap gap-2">
                  {onRevoke && !item.accessRevoked && (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={revoking || restoring}
                      className="border-rose-500/40 text-rose-200 hover:bg-rose-500/10"
                      onClick={() => setConfirmTarget({ item, action: "revoke" })}
                    >
                      {revoking ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <Ban className="mr-2 h-4 w-4" />
                      )}
                      Revoke
                    </Button>
                  )}
                  {onRestore && item.accessRevoked && (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={restoring || revoking}
                      className="border-emerald-500/40 text-emerald-200 hover:bg-emerald-500/10"
                      onClick={() => setConfirmTarget({ item, action: "restore" })}
                    >
                      {restoring ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <RotateCcw className="mr-2 h-4 w-4" />
                      )}
                      Restore access
                    </Button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <Pagination
        pagination={pagination}
        onPageChange={onPageChange}
        onPageSizeChange={onPageSizeChange}
      />

      <ShareAccessConfirmDialog
        open={Boolean(confirmTarget)}
        action={confirmTarget?.action ?? "revoke"}
        fileName={confirmTarget?.item.name ?? ""}
        recipient={confirmTarget?.item.recipient ?? ""}
        busy={confirmBusy}
        onClose={() => {
          if (!confirmBusy) {
            setConfirmTarget(null);
          }
        }}
        onConfirm={() => void runConfirmedAction()}
      />
    </section>
  );
}
