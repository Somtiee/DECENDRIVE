"use client";

import { ChevronDown, Menu, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

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
  const [panelTop, setPanelTop] = useState(0);
  const triggerRef = useRef<HTMLButtonElement>(null);
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
    if (!open) {
      return;
    }
    const updatePanelTop = () => {
      const rect = triggerRef.current?.getBoundingClientRect();
      if (rect) {
        setPanelTop(rect.bottom + 8);
      }
    };
    updatePanelTop();
    window.addEventListener("resize", updatePanelTop);
    window.addEventListener("scroll", updatePanelTop, true);
    return () => {
      window.removeEventListener("resize", updatePanelTop);
      window.removeEventListener("scroll", updatePanelTop, true);
    };
  }, [open]);

  useEffect(() => {
    setOpen(false);
  }, [currentView]);

  return (
    <div className="relative lg:hidden">
      <button
        ref={triggerRef}
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

      {open ? (
        <>
          <button
            type="button"
            aria-label="Close navigation menu"
            className="fixed inset-0 z-[120] bg-black/70"
            onClick={() => setOpen(false)}
          />
          <div
            id="mobile-drive-nav-panel"
            className="fixed right-3 left-3 z-[130] overflow-hidden rounded-xl border border-border bg-background shadow-[0_20px_50px_rgba(0,0,0,0.55)]"
            style={{ top: panelTop }}
          >
            <div className="border-b border-border px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Drive sections
              </p>
            </div>
            <div className="bg-background p-2">
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
