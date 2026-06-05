"use client";

import { ChevronDown, Menu, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";

import { DriveNavList, buildDriveNavItems, type DriveView } from "@/components/drive/sidebar";
import { cn } from "@/lib/utils";

const MOBILE_MENU_BG = "hsl(222, 47%, 6%)";

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
  const [mounted, setMounted] = useState(false);
  const items = useMemo(() => buildDriveNavItems(expiredRentCount), [expiredRentCount]);
  const activeItem = items.find((item) => item.view === currentView);
  const ActiveIcon = activeItem?.icon ?? Menu;

  useEffect(() => {
    setMounted(true);
  }, []);

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

  const menuOverlay =
    open && mounted
      ? createPortal(
          <div
            id="mobile-drive-nav-panel"
            role="dialog"
            aria-modal="true"
            aria-label="Drive navigation menu"
            className="mobile-drive-menu-overlay fixed inset-0 z-[9999] flex flex-col lg:hidden"
            style={{ backgroundColor: MOBILE_MENU_BG }}
          >
            <header className="flex shrink-0 items-center justify-between border-b border-[hsl(223,22%,20%)] px-4 py-4">
              <span className="text-sm font-bold tracking-[0.2em] text-white">MENU</span>
              <button
                type="button"
                aria-label="Close navigation menu"
                onClick={() => setOpen(false)}
                className="flex h-10 w-10 items-center justify-center rounded-xl border border-[hsl(223,22%,24%)] bg-[hsl(222,29%,12%)] text-foreground transition hover:border-sky-400/40"
              >
                <X className="h-4 w-4" />
              </button>
            </header>

            <div className="min-h-0 flex-1 overflow-y-auto px-4 py-5">
              <p className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-sky-400/90">
                Drive
              </p>
              <DriveNavList
                currentView={currentView}
                expiredRentCount={expiredRentCount}
                onViewChange={onViewChange}
                onNavigate={() => setOpen(false)}
                variant="drawer"
                className="space-y-2"
              />
            </div>
          </div>,
          document.body,
        )
      : null;

  return (
    <>
      <div className="relative lg:hidden">
        <button
          type="button"
          aria-expanded={open}
          aria-controls="mobile-drive-nav-panel"
          onClick={() => setOpen((value) => !value)}
          className="flex w-full items-center gap-3 rounded-xl border border-border/70 bg-card px-3 py-2.5 text-left transition hover:border-sky-400/35 hover:bg-card/90"
        >
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border/60 bg-background">
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
      </div>
      {menuOverlay}
    </>
  );
}
