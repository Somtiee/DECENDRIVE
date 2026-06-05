"use client";

import { ChevronDown, Menu, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { DriveNavList, buildDriveNavItems, type DriveView } from "@/components/drive/sidebar";
import { cn } from "@/lib/utils";

type MobileDriveNavProps = {
  currentView: DriveView;
  expiredRentCount?: number;
  onViewChange: (view: DriveView) => void;
};

export function MobileDriveNav({
  currentView,
  expiredRentCount = 0,
  onViewChange,
}: MobileDriveNavProps) {
  const [open, setOpen] = useState(false);
  const items = useMemo(() => buildDriveNavItems(expiredRentCount), [expiredRentCount]);
  const activeItem = items.find((item) => item.view === currentView);
  const ActiveIcon = activeItem?.icon ?? Menu;

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

  useEffect(() => {
    setOpen(false);
  }, [currentView]);

  return (
    <div className="relative lg:hidden">
      <button
        type="button"
        aria-expanded={open}
        aria-controls="mobile-drive-nav-panel"
        onClick={() => setOpen((value) => !value)}
        className="flex w-full items-center gap-3 rounded-xl border border-border/70 bg-card/60 px-3 py-2.5 text-left transition hover:border-sky-400/35 hover:bg-card/80"
      >
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border/60 bg-background/70">
          {open ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Section
          </span>
          <span className="flex items-center gap-2 truncate text-sm font-semibold">
            <ActiveIcon className="h-4 w-4 shrink-0 text-sky-300" aria-hidden />
            {activeItem?.label ?? "My Drive"}
            {activeItem?.badge != null && activeItem.badge > 0 ? (
              <span className="rounded-full bg-amber-500/20 px-2 py-0.5 text-[10px] font-semibold text-amber-100">
                {activeItem.badge}
              </span>
            ) : null}
          </span>
        </span>
        <ChevronDown
          className={cn("h-4 w-4 shrink-0 text-muted-foreground transition", open && "rotate-180")}
          aria-hidden
        />
      </button>

      {open ? (
        <>
          <button
            type="button"
            aria-label="Close navigation menu"
            className="fixed inset-0 z-40 bg-black/55 backdrop-blur-[1px]"
            onClick={() => setOpen(false)}
          />
          <div
            id="mobile-drive-nav-panel"
            className="absolute top-[calc(100%+0.5rem)] right-0 left-0 z-50 overflow-hidden rounded-xl border border-border/70 bg-card/95 shadow-2xl backdrop-blur-md"
          >
            <div className="border-b border-border/60 px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Drive sections
              </p>
            </div>
            <div className="p-2">
              <DriveNavList
                currentView={currentView}
                expiredRentCount={expiredRentCount}
                onViewChange={onViewChange}
                onNavigate={() => setOpen(false)}
                itemClassName="py-3"
              />
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}
