"use client";

import { VIEW_TRUST_COPY, type DriveTrustView } from "@/components/drive/trust/copy";
import { TrustBadgeRow } from "@/components/drive/trust/TrustBadge";
import { cn } from "@/lib/utils";

const VIEW_BADGES: Record<DriveTrustView, Array<"encrypted" | "onchain" | "walrus" | "local-decrypt" | "wallet">> = {
  "my-drive": ["encrypted", "walrus", "onchain"],
  trash: ["encrypted", "walrus"],
  "storage-rent": ["walrus", "onchain", "wallet"],
  shared: ["onchain", "encrypted", "wallet"],
  received: ["encrypted", "wallet", "local-decrypt"],
  upload: ["encrypted", "walrus", "onchain"],
};

type ViewTrustBannerProps = {
  view: DriveTrustView;
  className?: string;
};

export function ViewTrustBanner({ view, className }: ViewTrustBannerProps) {
  const copy = VIEW_TRUST_COPY[view];
  return (
    <div
      className={cn(
        "rounded-xl border border-sky-500/20 bg-gradient-to-r from-sky-500/5 via-transparent to-violet-500/5 px-4 py-3",
        className,
      )}
    >
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-foreground">{copy.headline}</p>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{copy.detail}</p>
        </div>
        <TrustBadgeRow kinds={VIEW_BADGES[view]} className="shrink-0 sm:max-w-[50%] sm:justify-end" />
      </div>
    </div>
  );
}
