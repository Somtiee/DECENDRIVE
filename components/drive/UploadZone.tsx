"use client";

import { fromBase64 } from "@mysten/bcs";
import {
  useCurrentAccount,
  useSignAndExecuteTransaction,
  useSignPersonalMessage,
} from "@mysten/dapp-kit";
import {
  CheckCircle2,
  FileUp,
  Coins,
  Loader2,
  Paperclip,
  Trash2,
  UploadCloud,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { TxProofLink } from "@/components/drive/TxProofLink";
import { recordUpload } from "@/lib/drive/activity";
import { Pagination } from "@/components/drive/Pagination";
import { saveFileMeta } from "@/lib/drive/file-metadata";
import { paginateSlice } from "@/lib/drive/pagination";
import {
  ensureStorageCreditsForUpload,
  encryptFileWithSeal,
  estimateTotalSuiForUpload,
  toPremiumFeeLabel,
  registerFileOnSui,
  uploadToWalrus,
} from "@/lib/sui/walrus";
import { getSuiBalance } from "@/lib/sui/wallet";
import { cn } from "@/lib/utils";

type UploadStage = "queued" | "encrypting" | "walrus" | "registering" | "success" | "error";

type UploadItem = {
  id: string;
  file: File;
  progress: number;
  stage: UploadStage;
  blobId?: string;
  txDigest?: string;
  walrusLink?: string;
  error?: string;
  updatedAt: string;
  encryptionKeyHash?: string;
  owner?: string;
};

type UploadZoneProps = {
  onUploadComplete?: () => void;
  uploadPage?: number;
  onUploadPageChange?: (page: number) => void;
};

function formatBytes(bytes: number) {
  if (bytes === 0) {
    return "0 B";
  }

  const sizes = ["B", "KB", "MB", "GB"];
  const index = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / 1024 ** index).toFixed(2)} ${sizes[index]}`;
}

function shorten(value: string, start = 6, end = 4) {
  if (value.length <= start + end) {
    return value;
  }
  return `${value.slice(0, start)}...${value.slice(-end)}`;
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

function toUserFriendlyErrorMessage(rawMessage: string) {
  const message = rawMessage.toLowerCase();

  if (message.includes("429") || message.includes("rate-limit") || message.includes("rate limit")) {
    return "Network is busy right now. Please retry in a few seconds.";
  }

  if (message.includes("unexpected status code")) {
    return "RPC service is temporarily busy. Please retry.";
  }

  if (message.includes("timed out") || message.includes("timeout")) {
    return "Upload network timed out. Please retry in a few seconds.";
  }

  if (
    message.includes("tip payment") ||
    message.includes("transaction id") ||
    message.includes("nonce") ||
    message.includes("blob-upload-relay")
  ) {
    return "Storage relay verification failed. Please retry upload.";
  }

  if (message.includes("add more sui")) {
    return "Add more SUI to continue";
  }

  return rawMessage;
}

export function UploadZone({
  onUploadComplete,
  uploadPage = 1,
  onUploadPageChange,
}: UploadZoneProps) {
  const account = useCurrentAccount();
  const { mutateAsync: signAndExecuteTransaction, isPending } = useSignAndExecuteTransaction();
  const { mutateAsync: signPersonalMessage, isPending: isSigningMessage } = useSignPersonalMessage();
  const [items, setItems] = useState<UploadItem[]>([]);
  const [dragActive, setDragActive] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [currentStep, setCurrentStep] = useState<string>("Ready");
  const [hasEnoughSui, setHasEnoughSui] = useState<boolean | null>(null);
  const [successBanner, setSuccessBanner] = useState<string | null>(null);
  const walletAddress = account?.address ?? null;
  const walletReady = Boolean(account?.address);
  const estimatedTotalSuiLabel = useMemo(() => {
    const totalSize = items.reduce((sum, item) => sum + item.file.size, 0);
    return toPremiumFeeLabel(estimateTotalSuiForUpload(totalSize));
  }, [items]);

  useEffect(() => {
    async function refreshFundingStatus() {
      if (!walletAddress) {
        setHasEnoughSui(null);
        return;
      }

      const totalSize = items.reduce((sum, item) => sum + item.file.size, 0);
      const neededSui = estimateTotalSuiForUpload(totalSize);
      if (totalSize <= 0) {
        setHasEnoughSui(true);
        return;
      }

      try {
        const balance = await getSuiBalance(walletAddress);
        setHasEnoughSui(balance.totalSui >= neededSui);
      } catch {
        setHasEnoughSui(null);
      }
    }

    void refreshFundingStatus();
  }, [items, walletAddress]);

  useEffect(() => {
    if (!successBanner) {
      return;
    }
    const timer = setTimeout(() => setSuccessBanner(null), 6000);
    return () => clearTimeout(timer);
  }, [successBanner]);

  const updateItem = useCallback((id: string, update: Partial<UploadItem>) => {
    setItems((prev) =>
      prev.map((item) =>
        item.id === id
          ? {
              ...item,
              ...update,
              updatedAt: new Date().toISOString(),
            }
          : item,
      ),
    );
  }, []);

  const removeItem = useCallback((id: string) => {
    setItems((prev) => prev.filter((item) => item.id !== id));
  }, []);

  const clearQueued = useCallback(() => {
    setItems((prev) => prev.filter((item) => item.stage !== "queued" && item.stage !== "error"));
  }, []);

  const addFiles = useCallback((fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) {
      return;
    }

    const queuedItems = Array.from(fileList).map((file) => ({
      id: crypto.randomUUID(),
      file,
      progress: 0,
      stage: "queued" as const,
      updatedAt: new Date().toISOString(),
    }));

    setItems((prev) => [...queuedItems, ...prev]);
  }, []);

  async function runUploadPipeline() {
    if (!walletAddress) {
      toast.error("Connect a Sui wallet to upload files.");
      return;
    }

    const queued = items.filter((item) => item.stage === "queued" || item.stage === "error");
    if (queued.length === 0) {
      toast.info("No queued files to upload.");
      return;
    }
    setIsUploading(true);
    const totalSize = queued.reduce((sum, item) => sum + item.file.size, 0);
    const signer = async (message: Uint8Array) => {
      const result = await signPersonalMessage({
        message,
      });
      return getSignatureBytes(result);
    };

    setCurrentStep("1. Buying storage credits with SUI");
    toast.loading("Preparing upload funding from SUI...", { id: "autofund" });

    try {
      const prep = await ensureStorageCreditsForUpload(
        {
          address: walletAddress,
          executeTransaction: async (transaction) => {
            const result = await signAndExecuteTransaction({
              transaction,
              chain: "sui:mainnet",
            });
            return { digest: getDigestFromResult(result) };
          },
        },
        totalSize,
      );

      if (prep.swapPerformed) {
        toast.success("Funding ready. Continuing upload.", {
          id: "autofund",
        });
      } else {
        toast.dismiss("autofund");
      }
    } catch (error) {
      toast.dismiss("autofund");
      const message = error instanceof Error ? error.message : "Upload funding failed.";
      const friendlyMessage = toUserFriendlyErrorMessage(message);
      if (friendlyMessage.toLowerCase().includes("add more sui")) {
        toast.error("Add more SUI to continue");
      } else {
        toast.error(friendlyMessage);
      }
      setIsUploading(false);
      setCurrentStep("Ready");
      return;
    }

    let uploadSuccessCount = 0;

    for (const item of queued) {
      try {
        updateItem(item.id, { stage: "encrypting", progress: 12, error: undefined });
        setCurrentStep("2. Encrypting");
        const encrypted = await encryptFileWithSeal(item.file, walletAddress, {
          signer,
        });

        updateItem(item.id, { stage: "walrus", progress: 45 });
        setCurrentStep("3. Uploading to decentralized storage");
        const walrusUpload = await uploadToWalrus(encrypted.encryptedBlob);

        updateItem(item.id, {
          stage: "registering",
          progress: 75,
          blobId: walrusUpload.blobId,
          encryptionKeyHash: encrypted.keyHashHex,
          owner: walletAddress,
        });
        setCurrentStep("4. Registering on Sui");

        const registration = await registerFileOnSui(
          {
            address: walletAddress,
            executeTransaction: async (transaction) => {
              const result = await signAndExecuteTransaction({
                transaction,
                chain: "sui:mainnet",
              });
              return { digest: getDigestFromResult(result) };
            },
          },
          walrusUpload.blobId,
          {
            name: item.file.name,
            size: item.file.size,
            mimeType: item.file.type || "application/octet-stream",
            owner: walletAddress,
            encryptionKeyHash: encrypted.keyHashHex,
            upload: walrusUpload,
          },
        );

        saveFileMeta(registration.blobId, {
          name: item.file.name,
          mimeType: item.file.type || "application/octet-stream",
          size: item.file.size,
          uploadedAt: Date.now(),
        });
        recordUpload(registration.blobId, item.file.name, registration.digest);

        updateItem(item.id, {
          stage: "success",
          progress: 100,
          blobId: registration.blobId,
          txDigest: registration.digest,
          walrusLink: registration.walrusLink,
          encryptionKeyHash: encrypted.keyHashHex,
          owner: walletAddress,
        });

        toast.success(`Uploaded ${item.file.name}`, {
          description: (
            <span className="inline-flex flex-col gap-1">
              <span>
                On-chain proof: <TxProofLink digest={registration.digest} />
              </span>
              <span className="text-[11px] text-muted-foreground">Walrus: {registration.walrusLink}</span>
            </span>
          ),
        });
        setSuccessBanner(`${item.file.name} is now in My Drive.`);
        removeItem(item.id);
        uploadSuccessCount += 1;
      } catch (error) {
        const message = error instanceof Error ? error.message : "Upload failed.";
        const friendlyMessage = toUserFriendlyErrorMessage(message);
        updateItem(item.id, {
          stage: "error",
          progress: 100,
          error: friendlyMessage,
        });
        toast.error(`Failed to upload ${item.file.name}`, {
          description: friendlyMessage.toLowerCase().includes("add more sui")
            ? "Add more SUI to continue"
            : friendlyMessage,
        });
      }
    }

    setCurrentStep("Ready");
    setIsUploading(false);
    if (uploadSuccessCount > 0) {
      onUploadComplete?.();
    }
  }

  return (
    <Card className="border-border/70 bg-card/70">
      <CardHeader className="gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="text-lg">Secure Mainnet Uploads</CardTitle>
          <Badge variant="outline">{items.length} selected</Badge>
        </div>
        <CardDescription>
          Files are encrypted in your browser (Seal), stored on Walrus, and registered on Sui mainnet — you
          hold the keys; we cannot read your content.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {successBanner && (
          <div
            role="status"
            className="flex items-center gap-2 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-300 transition-opacity duration-500 animate-in fade-in"
          >
            <CheckCircle2 className="h-4 w-4" />
            <span>{successBanner}</span>
          </div>
        )}

        <div className="rounded-lg border border-border/70 bg-background/40 p-3 text-xs text-muted-foreground">
          <div className="flex flex-wrap items-center gap-3">
            <span className="inline-flex items-center gap-1">
              <Coins className="h-3.5 w-3.5" />
              Estimated: {estimatedTotalSuiLabel} total (includes auto-conversion)
            </span>
            <span>Just hold SUI — we auto-convert what you need (one click).</span>
            <span>Flow: Buying with SUI → Encrypting → Uploading → Registering</span>
            <span>Current step: {currentStep}</span>
            <span>No file size limits.</span>
          </div>
        </div>

        <label
          className={cn(
            "flex cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed p-6 text-center transition duration-200 sm:p-10",
            dragActive
              ? "border-sky-400 bg-sky-500/10 shadow-[0_0_24px_rgba(56,189,248,0.2)]"
              : "border-border bg-secondary/20 hover:border-sky-400/40 hover:bg-sky-500/5 hover:shadow-[0_0_18px_rgba(56,189,248,0.1)]",
          )}
          onDragOver={(event) => {
            event.preventDefault();
            setDragActive(true);
          }}
          onDragLeave={() => setDragActive(false)}
          onDrop={(event) => {
            event.preventDefault();
            setDragActive(false);
            addFiles(event.dataTransfer.files);
          }}
        >
          <UploadCloud className="mb-3 h-10 w-10 text-primary" />
          <p className="text-sm font-medium">Drag & drop files to encrypt and upload</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Stored on decentralized mainnet storage and indexed with a Sui transaction digest.
          </p>
          <input
            className="sr-only"
            type="file"
            multiple
            onChange={(event) => {
              addFiles(event.target.files);
              // Allow selecting the same file again after it was removed from queue.
              event.currentTarget.value = "";
            }}
          />
        </label>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            onClick={() => {
              void runUploadPipeline();
            }}
            disabled={!walletReady || hasEnoughSui === false || isUploading || isPending || items.length === 0}
            className="border border-primary/40 bg-primary/90 shadow-[0_0_16px_rgba(56,189,248,0.25)] transition duration-200 hover:scale-[1.02] hover:border-sky-300 hover:bg-primary hover:shadow-[0_0_24px_rgba(56,189,248,0.45)] active:scale-[0.98] disabled:hover:scale-100 disabled:hover:shadow-none"
          >
            {(isUploading || isPending || isSigningMessage) && (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            )}
            <FileUp className="mr-2 h-4 w-4" />
            Upload {items.length > 0 ? `${items.length} file${items.length > 1 ? "s" : ""}` : ""}
          </Button>
          {!walletReady && (
            <Badge variant="outline">Connect wallet to start upload</Badge>
          )}
          {walletReady && hasEnoughSui === false && <Badge variant="outline">Add more SUI to continue</Badge>}
          {items.some((item) => item.stage === "queued" || item.stage === "error") && (
            <Button
              type="button"
              variant="outline"
              onClick={clearQueued}
              disabled={isUploading}
            >
              <Trash2 className="mr-2 h-4 w-4" />
              Clear queued
            </Button>
          )}
        </div>

        {items.length > 0 && (() => {
          const paged = paginateSlice(items, uploadPage, 6);
          return (
            <div className="rounded-lg border border-border/70 bg-background/40 p-3">
              <div className="mb-2 flex items-center justify-between gap-2">
                <p className="text-xs font-medium text-muted-foreground">Selected files</p>
                <p className="text-xs text-muted-foreground">
                  {items.reduce((sum, item) => sum + item.file.size, 0) > 0
                    ? formatBytes(items.reduce((sum, item) => sum + item.file.size, 0))
                    : "0 B"}
                </p>
              </div>
              <div className="space-y-2">
                {paged.items.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-center justify-between gap-2 rounded-md bg-background/60 px-2 py-1.5 text-xs"
                  >
                    <span className="inline-flex min-w-0 items-center gap-1.5">
                      <Paperclip className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                      <span className="truncate">{item.file.name}</span>
                    </span>
                    <span className="inline-flex items-center gap-2">
                      <Badge variant={item.stage === "error" ? "outline" : "secondary"}>{item.stage}</Badge>
                      {(item.stage === "queued" || item.stage === "error") && (
                        <button
                          type="button"
                          onClick={() => removeItem(item.id)}
                          disabled={isUploading}
                          className="text-muted-foreground transition hover:text-foreground"
                        >
                          Remove
                        </button>
                      )}
                    </span>
                  </div>
                ))}
              </div>
              {onUploadPageChange && (
                <Pagination
                  pagination={paged.pagination}
                  onPageChange={onUploadPageChange}
                  className="mt-3"
                />
              )}
            </div>
          );
        })()}
      </CardContent>
    </Card>
  );
}
