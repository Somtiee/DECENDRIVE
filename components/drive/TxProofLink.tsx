"use client";

import { ExternalLink } from "lucide-react";

import { shortenTxDigest, suiMainnetTxExplorerUrl } from "@/lib/sui/explorer";
import { cn } from "@/lib/utils";

type TxProofLinkProps = {
  digest: string;
  className?: string;
  label?: string;
  showIcon?: boolean;
};

export function TxProofLink({
  digest,
  className,
  label,
  showIcon = true,
}: TxProofLinkProps) {
  if (!digest) {
    return null;
  }

  return (
    <a
      href={suiMainnetTxExplorerUrl(digest)}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(
        "inline-flex items-center gap-1 font-medium text-sky-300 underline-offset-2 transition hover:text-sky-200 hover:underline",
        className,
      )}
      title="View transaction on Sui mainnet (Suiscan)"
    >
      {label ?? `Tx ${shortenTxDigest(digest)}`}
      {showIcon ? <ExternalLink className="h-3 w-3 shrink-0 opacity-80" aria-hidden /> : null}
    </a>
  );
}
