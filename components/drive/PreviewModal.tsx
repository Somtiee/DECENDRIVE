"use client";

import { Download, FileQuestion, X } from "lucide-react";

import { TrustBadgeRow } from "@/components/drive/trust";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { previewKindForMime } from "@/lib/drive/file-metadata";

export type PreviewTarget = {
  name: string;
  mimeType: string;
  url: string;
};

type PreviewModalProps = {
  preview: PreviewTarget | null;
  onClose: () => void;
};

export function PreviewModal({ preview, onClose }: PreviewModalProps) {
  if (!preview) {
    return null;
  }

  const kind = previewKindForMime(preview.mimeType);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#020408] p-3 sm:p-6"
      onClick={onClose}
    >
      <div
        className="flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-xl border border-slate-700/80 bg-[#0b1018] shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-2 border-b border-border/70 px-4 py-3">
          <div className="flex min-w-0 items-center gap-2">
            <p className="truncate text-sm font-semibold">{preview.name}</p>
            <Badge variant="secondary" className="hidden sm:inline-flex">
              {preview.mimeType}
            </Badge>
          </div>
          <div className="flex items-center gap-2">
            <Button asChild size="sm" variant="outline">
              <a href={preview.url} download={preview.name}>
                <Download className="mr-2 h-4 w-4" />
                Download
              </a>
            </Button>
            <button
              type="button"
              onClick={onClose}
              className="rounded-md p-1.5 text-muted-foreground transition hover:bg-secondary/60 hover:text-foreground"
              aria-label="Close preview"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="border-b border-border/60 bg-emerald-500/5 px-4 py-2">
          <p className="text-xs text-muted-foreground">
            Decrypted locally in your browser — plaintext never sent to DecenDrive servers.
          </p>
          <TrustBadgeRow kinds={["local-decrypt", "encrypted"]} className="mt-1.5" />
        </div>

        <div className="flex min-h-[40vh] flex-1 items-center justify-center overflow-auto bg-background/40 p-3">
          {kind === "image" && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={preview.url} alt={preview.name} className="max-h-[78vh] w-auto object-contain" />
          )}
          {kind === "pdf" && (
            <iframe title={preview.name} src={preview.url} className="h-[78vh] w-full rounded-md border-0" />
          )}
          {kind === "text" && (
            <iframe title={preview.name} src={preview.url} className="h-[78vh] w-full rounded-md border-0 bg-white" />
          )}
          {kind === "video" && (
            <video
              src={preview.url}
              controls
              autoPlay
              playsInline
              preload="metadata"
              className="max-h-[78vh] w-full rounded-md bg-black"
            />
          )}
          {kind === "audio" && <audio src={preview.url} controls className="w-full" />}
          {kind === "unsupported" && (
            <div className="flex flex-col items-center gap-3 px-6 py-12 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-secondary/60">
                <FileQuestion className="h-6 w-6 text-muted-foreground" />
              </div>
              <p className="text-sm font-medium">Preview not available for this file type</p>
              <p className="max-w-sm text-sm text-muted-foreground">
                The file was decrypted successfully. Use Download to open it on your device.
              </p>
              <Button asChild size="sm">
                <a href={preview.url} download={preview.name}>
                  <Download className="mr-2 h-4 w-4" />
                  Download {preview.name}
                </a>
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
