"use client";

import { KeyRound, Link2, ShieldOff } from "lucide-react";

import { TRUST_PILLARS } from "@/components/drive/trust/copy";
import { cn } from "@/lib/utils";

const PILLAR_ICONS = [KeyRound, Link2, ShieldOff] as const;

type TrustPillarsProps = {
  compact?: boolean;
  className?: string;
};

export function TrustPillars({ compact = false, className }: TrustPillarsProps) {
  return (
    <div
      className={cn(
        "grid gap-3",
        compact ? "sm:grid-cols-3" : "gap-4 md:grid-cols-3",
        className,
      )}
    >
      {TRUST_PILLARS.map((pillar, index) => {
        const Icon = PILLAR_ICONS[index];
        return (
          <div
            key={pillar.id}
            className={cn(
              "rounded-xl border border-border/70 bg-background/40",
              compact ? "px-3 py-2.5" : "px-4 py-3",
            )}
          >
            <div className="mb-1.5 flex items-center gap-2">
              <span className="flex h-7 w-7 items-center justify-center rounded-lg border border-sky-500/30 bg-sky-500/10">
                <Icon className="h-3.5 w-3.5 text-sky-300" aria-hidden />
              </span>
              <p className={cn("font-semibold text-foreground", compact ? "text-xs" : "text-sm")}>
                {pillar.title}
              </p>
            </div>
            <p className={cn("leading-relaxed text-muted-foreground", compact ? "text-[11px]" : "text-xs")}>
              {pillar.description}
            </p>
          </div>
        );
      })}
    </div>
  );
}
