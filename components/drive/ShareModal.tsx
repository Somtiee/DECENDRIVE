"use client";



import { useCurrentAccount, useSignAndExecuteTransaction, useSignPersonalMessage } from "@mysten/dapp-kit";

import { fromBase64 } from "@mysten/bcs";

import { Transaction } from "@mysten/sui/transactions";

import { Folder, Loader2, Share2, Wallet, X } from "lucide-react";

import { useEffect, useState } from "react";

import { toast } from "sonner";

import { isValidSuiAddress } from "@mysten/sui/utils";



import type { ShareTarget } from "@/components/drive/share-target";

import { recordShared } from "@/lib/drive/activity";

import { saveFolderShareManifest } from "@/lib/drive/file-metadata";

import { TxProofLink } from "@/components/drive/TxProofLink";

import {

  decenDrivePackageId,

  sendShareInvitation,

  sendShareInvitationsBatch,

} from "@/lib/sui/contract";

import { TrustBadgeRow } from "@/components/drive/trust";

import type { ShareCompletedPayload } from "@/lib/drive/share-optimistic";
import { FULL_SHARE_PERMISSION_FLAGS, wrapOwnerKeyForRecipient } from "@/lib/sui/share-crypto";



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



type ShareModalProps = {

  open: boolean;

  target: ShareTarget | null;

  onOpenChange: (open: boolean) => void;

  onShared?: (payload: ShareCompletedPayload) => void;

};



export function ShareModal({ open, target, onOpenChange, onShared }: ShareModalProps) {

  const account = useCurrentAccount();

  const { mutateAsync: signAndExecuteTransaction } = useSignAndExecuteTransaction();

  const { mutateAsync: signPersonalMessage } = useSignPersonalMessage();

  const [recipient, setRecipient] = useState("");

  const [isSubmitting, setIsSubmitting] = useState(false);

  const packageReady = decenDrivePackageId !== "0x0" && isValidSuiAddress(decenDrivePackageId);

  const recipientValid = isValidSuiAddress(recipient.trim());

  const walletConnected = Boolean(account?.address);



  useEffect(() => {

    if (!open) {

      return;

    }

    const previousOverflow = document.body.style.overflow;

    document.body.style.overflow = "hidden";

    return () => {

      document.body.style.overflow = previousOverflow;

    };

  }, [open]);



  if (!open || !target) {

    return null;

  }



  const isFolder = target.type === "folder";

  const displayName = isFolder ? target.folder.name : target.file.name;

  const folderEmpty = isFolder && target.files.length === 0;

  const recipientAddress = recipient.trim();

  const isSelfRecipient =

    Boolean(account?.address) &&

    recipientValid &&

    recipientAddress.toLowerCase() === (account?.address ?? "").toLowerCase();



  const canSend =

    walletConnected &&

    recipientValid &&

    !isSelfRecipient &&

    !folderEmpty &&

    !isSubmitting &&

    packageReady;



  const disabledReason =

    !packageReady

      ? "Deploy the DecenDrive contract and set NEXT_PUBLIC_DECENDRIVE_PACKAGE_ID, then restart the dev server."

      : !walletConnected

        ? "Connect your wallet to share."

        : !recipientValid

          ? "Enter a valid recipient Sui wallet address."

          : isSelfRecipient

            ? "You cannot share with your own wallet address."

            : folderEmpty

              ? "Add files to this folder before sharing."

              : null;



  return (

    <div

      className="fixed inset-0 z-[70] flex items-end justify-center bg-[#020408] p-3 sm:items-center sm:p-4"

      role="presentation"

      onClick={() => onOpenChange(false)}

    >

      <div

        role="dialog"

        aria-modal="true"

        aria-labelledby="share-dialog-title"

        className="relative max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-sky-500/30 bg-[#0b1018] p-5 shadow-[0_0_0_1px_rgba(56,189,248,0.12),0_0_40px_rgba(56,189,248,0.15),0_24px_48px_rgba(0,0,0,0.65)] sm:p-6"

        onClick={(event) => event.stopPropagation()}

      >

        <div

          className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-sky-400/80 to-transparent"

          aria-hidden

        />



        <button

          type="button"

          aria-label="Close"

          className="absolute right-3 top-3 rounded-lg p-1.5 text-slate-400 transition hover:bg-white/5 hover:text-white"

          onClick={() => onOpenChange(false)}

        >

          <X className="h-4 w-4" />

        </button>



        <div className="mb-4 flex flex-wrap items-center justify-between gap-2 pr-8">

          <h2 id="share-dialog-title" className="text-lg font-semibold text-white">

            {isFolder ? "Share folder with wallet" : "Share with wallet"}

          </h2>

          <span className="max-w-[55%] truncate rounded-full border border-slate-600 bg-[#141c28] px-2.5 py-1 text-xs text-slate-200">

            {isFolder ? (

              <span className="inline-flex items-center gap-1">

                <Folder className="h-3 w-3 text-sky-400" />

                {displayName}

              </span>

            ) : (

              displayName

            )}

          </span>

        </div>



        <p className="mb-3 text-sm leading-relaxed text-slate-300">

          {isFolder ? (

            <>

              Sends on-chain invitations for {target.files.length} file

              {target.files.length === 1 ? "" : "s"}. Recipient accepts under{" "}

              <strong className="text-white">Received → Pending</strong>.

            </>

          ) : (

            <>

              Sends an on-chain invitation on Sui mainnet. File stays encrypted on{" "}

              <strong className="text-white">Walrus</strong>. Recipient accepts under{" "}

              <strong className="text-white">Received → Pending</strong>.

            </>

          )}

        </p>



        <TrustBadgeRow kinds={["encrypted", "onchain", "wallet"]} className="mb-4" />



        {folderEmpty && (

          <div className="mb-4 rounded-xl border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">

            This folder has no files to share. Add files first, then share the folder.

          </div>

        )}



        {!packageReady && (

          <div className="mb-4 rounded-xl border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">

            Contract package ID is missing. Set{" "}

            <code className="text-[11px]">NEXT_PUBLIC_DECENDRIVE_PACKAGE_ID</code> in `.env` and restart{" "}

            <code className="text-[11px]">npm run dev</code>.

          </div>

        )}



        <div className="space-y-4">

          <div className="space-y-2">

            <label className="text-xs font-medium text-slate-400">Recipient Sui wallet</label>

            <div className="relative">

              <Wallet className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />

              <input

                className={`flex h-10 w-full rounded-lg border bg-[#111827] pl-9 pr-3 text-sm text-white placeholder:text-slate-500 focus-visible:outline-none focus-visible:ring-2 ${

                  isSelfRecipient

                    ? "border-rose-500/60 focus-visible:border-rose-400 focus-visible:ring-rose-400/40"

                    : "border-slate-600 focus-visible:border-sky-400 focus-visible:ring-sky-400/40"

                }`}

                value={recipient}

                onChange={(event) => setRecipient(event.target.value)}

                placeholder="0x…"

              />

            </div>

            {isSelfRecipient && (

              <p className="text-xs text-rose-300">

                Sharing to yourself is not allowed. Paste a different recipient wallet.

              </p>

            )}

          </div>



          <div className="rounded-xl border border-sky-500/30 bg-sky-500/10 px-3.5 py-3 text-xs leading-relaxed text-slate-300">
            Recipients can <span className="font-medium text-sky-100">view and download</span> after
            they accept. Manage access anytime from{" "}
            <span className="font-medium text-sky-100">Shared</span> — revoke or restore per
            recipient.
            {isFolder ? (
              <>
                {" "}
                Every file in this folder is shared with the same full access.
              </>
            ) : null}
          </div>



        </div>



        {disabledReason && (

          <p className="mt-4 text-xs text-amber-200/90">{disabledReason}</p>

        )}



        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">

          <button

            type="button"

            className="inline-flex h-10 items-center justify-center rounded-lg border border-slate-600 bg-[#141c28] px-4 text-sm font-medium text-slate-200 transition hover:border-sky-400/60 hover:text-white"

            onClick={() => onOpenChange(false)}

          >

            Cancel

          </button>

          <button

            type="button"

            disabled={!canSend}

            className="inline-flex h-10 items-center justify-center rounded-lg border border-sky-500/50 bg-gradient-to-r from-sky-600 to-sky-500 px-4 text-sm font-semibold text-white shadow-[0_0_20px_rgba(56,189,248,0.35)] transition duration-200 hover:scale-[1.02] hover:border-sky-300 hover:shadow-[0_0_28px_rgba(56,189,248,0.5)] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:scale-100 disabled:hover:shadow-none"

            onClick={async () => {

              if (!canSend || !account?.address || isSelfRecipient) {

                if (isSelfRecipient) {

                  toast.error("You cannot share with yourself.");

                }

                return;

              }



              setIsSubmitting(true);

              const toastId = toast.loading(

                isFolder ? "Preparing folder share…" : "Preparing encrypted share…",

              );

              try {

                const signer = async (message: Uint8Array) => {

                  const result = await signPersonalMessage({ message });

                  return getSignatureBytes(result);

                };



                const expiresAt = 0;

                const createdAt = Date.now();



                const executor = {

                  executeTransaction: async (tx: Transaction) => {

                    const response = await signAndExecuteTransaction({

                      transaction: tx,

                      chain: "sui:mainnet",

                    });

                    return { digest: getDigestFromResult(response) };

                  },

                };



                if (target.type === "file") {
                  const keyWrapper = await wrapOwnerKeyForRecipient({

                    owner: account.address,

                    recipient: recipientAddress,

                    blobId: target.file.blobId,

                    ownerSigner: signer,

                  });



                  const result = await sendShareInvitation(executor, {

                    blobId: target.file.blobId,

                    recipient: recipientAddress,

                    filename: target.file.name,

                    mimeType: target.file.mimeType ?? "application/octet-stream",

                    size: target.file.size,

                    encryptionKeyHash: target.file.encryptionKeyHash,

                    keyWrapper,

                    permissions: FULL_SHARE_PERMISSION_FLAGS,

                    expiresAt,

                    createdAt,

                    walrusObjectId: target.file.isWalrusBlob ? target.file.objectId : null,

                    fileObjectId: target.file.isWalrusBlob ? null : target.file.objectId,

                  });



                  recordShared(target.file.blobId, target.file.name, recipientAddress, result.digest);

                  toast.success("Share invitation sent on-chain.", {
                    id: toastId,
                    description: (
                      <span>
                        Proof: <TxProofLink digest={result.digest} /> — opening{" "}
                        <strong>Shared</strong>.
                      </span>
                    ),
                    duration: 8000,
                  });

                  onShared?.({
                    recipient: recipientAddress,
                    txDigest: result.digest,
                    createdAt,
                    items: [
                      {
                        blobId: target.file.blobId,
                        name: target.file.name,
                        fileObjectId: target.file.decendriveFileId ?? target.file.objectId,
                      },
                    ],
                  });
                  onOpenChange(false);
                  return;

                } else {

                  const invitations = [];

                  for (const file of target.files) {

                    const keyWrapper = await wrapOwnerKeyForRecipient({

                      owner: account.address,

                      recipient: recipientAddress,

                      blobId: file.blobId,

                      ownerSigner: signer,

                    });

                    invitations.push({

                      blobId: file.blobId,

                      recipient: recipientAddress,

                      filename: `${target.folder.name}/${file.name}`,

                      mimeType: file.mimeType ?? "application/octet-stream",

                      size: file.size,

                      encryptionKeyHash: file.encryptionKeyHash,

                      keyWrapper,

                      permissions: FULL_SHARE_PERMISSION_FLAGS,

                      expiresAt,

                      createdAt,

                      walrusObjectId: file.isWalrusBlob ? file.objectId : null,

                      fileObjectId: file.isWalrusBlob ? null : file.objectId,

                    });

                  }



                  const result = await sendShareInvitationsBatch(executor, invitations);

                  saveFolderShareManifest({

                    folderId: target.folder.id,

                    folderName: target.folder.name,

                    blobIds: target.files.map((file) => file.blobId),

                    createdAt,

                  });

                  for (const file of target.files) {

                    recordShared(

                      file.blobId,

                      `${target.folder.name}/${file.name}`,

                      recipientAddress,

                      result.digest,

                    );

                  }

                  toast.success("Folder shared on-chain.", {

                    id: toastId,

                    description: (

                      <span className="inline-flex flex-wrap items-center gap-1">

                        {target.files.length} invitation(s) ·{" "}

                        <TxProofLink digest={result.digest} /> — opening <strong>Shared</strong>

                      </span>

                    ),

                  });

                  onShared?.({
                    recipient: recipientAddress,
                    txDigest: result.digest,
                    createdAt,
                    items: target.files.map((file) => ({
                      blobId: file.blobId,
                      name: `${target.folder.name}/${file.name}`,
                      fileObjectId: file.decendriveFileId ?? file.objectId,
                    })),
                  });
                  onOpenChange(false);
                  return;

                }

              } catch (error) {

                const message = error instanceof Error ? error.message : "Share failed.";

                const rejected =

                  message.toLowerCase().includes("reject") ||

                  message.toLowerCase().includes("denied") ||

                  message.toLowerCase().includes("cancel");

                const hint = rejected

                  ? "Approve the wallet signature prompt, then the share transaction."

                  : message;

                toast.error(isFolder ? "Could not share folder" : "Could not share file", {

                  id: toastId,

                  description: hint,

                  duration: 12_000,

                });

              } finally {

                setIsSubmitting(false);

              }

            }}

          >

            {isSubmitting ? (

              <Loader2 className="mr-2 h-4 w-4 animate-spin" />

            ) : (

              <Share2 className="mr-2 h-4 w-4" />

            )}

            {isFolder ? "Share folder" : "Send share invitation"}

          </button>

        </div>

      </div>

    </div>

  );

}


