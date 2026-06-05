"use client";

import { Ban, X } from "lucide-react";

import { Button } from "@/components/ui/button";

type AccessRevokedDialogProps = {
  open: boolean;
  fileName?: string;
  onClose: () => void;
};

export function AccessRevokedDialog({ open, fileName, onClose }: AccessRevokedDialogProps) {
  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/70 p-4">
      <div className="w-full max-w-md rounded-2xl border border-rose-500/30 bg-[#0b1018] p-6 shadow-xl">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div className="flex items-center gap-2">
            <Ban className="h-5 w-5 text-rose-400" />
            <h3 className="font-semibold text-white">Access revoked by sender</h3>
          </div>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-white">
            <X className="h-4 w-4" />
          </button>
        </div>
        <p className="text-sm leading-relaxed text-slate-300">
          The owner removed your access
          {fileName ? (
            <>
              {" "}
              to <span className="font-medium text-white">{fileName}</span>
            </>
          ) : null}
          . You can no longer preview, download, or receive this file.
        </p>
        <div className="mt-5 flex justify-end">
          <Button type="button" size="sm" onClick={onClose}>
            OK
          </Button>
        </div>
      </div>
    </div>
  );
}
