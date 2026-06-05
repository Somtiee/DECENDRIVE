"use client";

import { Ban, Loader2, RotateCcw, X } from "lucide-react";

import { Button } from "@/components/ui/button";

export type ShareAccessConfirmAction = "revoke" | "restore";

type ShareAccessConfirmDialogProps = {
  open: boolean;
  action: ShareAccessConfirmAction;
  fileName: string;
  recipient: string;
  busy?: boolean;
  onClose: () => void;
  onConfirm: () => void;
};

export function ShareAccessConfirmDialog({
  open,
  action,
  fileName,
  recipient,
  busy = false,
  onClose,
  onConfirm,
}: ShareAccessConfirmDialogProps) {
  if (!open) {
    return null;
  }

  const shortRecipient = `${recipient.slice(0, 8)}…${recipient.slice(-6)}`;
  const isRevoke = action === "revoke";

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-[#020408] p-4">
      <div
        role="dialog"
        aria-modal="true"
        className={`w-full max-w-md rounded-2xl border bg-[#0b1018] p-6 shadow-2xl ${
          isRevoke ? "border-rose-500/40" : "border-emerald-500/40"
        }`}
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <div className="flex items-center gap-2">
            {isRevoke ? (
              <Ban className="h-5 w-5 text-rose-400" />
            ) : (
              <RotateCcw className="h-5 w-5 text-emerald-400" />
            )}
            <h3 className="font-semibold text-white">
              {isRevoke ? "Revoke access?" : "Restore access?"}
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="rounded-lg p-1.5 text-slate-400 transition hover:bg-white/5 hover:text-white disabled:opacity-50"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <p className="text-sm leading-relaxed text-slate-300">
          {isRevoke ? (
            <>
              Remove access for wallet <span className="font-medium text-white">{shortRecipient}</span>{" "}
              to <span className="font-medium text-white">{fileName}</span>? They will no longer be
              able to view, download, or receive this file — even if they already moved it to their
              drive.
            </>
          ) : (
            <>
              Restore access for wallet <span className="font-medium text-white">{shortRecipient}</span>{" "}
              to <span className="font-medium text-white">{fileName}</span>? They will be able to
              view, download, and receive this file again.
            </>
          )}
        </p>

        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button type="button" variant="outline" size="sm" disabled={busy} onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="button"
            size="sm"
            disabled={busy}
            className={
              isRevoke
                ? "border-rose-500/50 bg-rose-600 text-white hover:bg-rose-500"
                : "border-emerald-500/50 bg-emerald-600 text-white hover:bg-emerald-500"
            }
            onClick={onConfirm}
          >
            {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            {isRevoke ? "Revoke access" : "Restore access"}
          </Button>
        </div>
      </div>
    </div>
  );
}
