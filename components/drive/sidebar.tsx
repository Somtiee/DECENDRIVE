"use client";

import { FolderKanban, HardDrive, Inbox, Share2, Trash2, type LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";

export type DriveView = "my-drive" | "trash" | "storage-rent" | "shared" | "received";

type DriveNavItem = {
  view: DriveView;
  label: string;
  icon: LucideIcon;
  badge?: number;
};

const BASE_NAV_ITEMS: Omit<DriveNavItem, "badge">[] = [
  { view: "my-drive", label: "My Drive", icon: FolderKanban },
  { view: "trash", label: "Trash", icon: Trash2 },
  { view: "storage-rent", label: "Storage rent", icon: HardDrive },
  { view: "shared", label: "Shared", icon: Share2 },
  { view: "received", label: "Received", icon: Inbox },
];

export function buildDriveNavItems(expiredRentCount = 0): DriveNavItem[] {
  return BASE_NAV_ITEMS.map((item) => ({
    ...item,
    badge: item.view === "storage-rent" ? expiredRentCount : undefined,
  }));
}

type DriveNavListProps = {
  currentView: DriveView;
  expiredRentCount?: number;
  onViewChange: (view: DriveView) => void;
  onNavigate?: () => void;
  className?: string;
  itemClassName?: string;
  variant?: "sidebar" | "drawer";
};

export function DriveNavList({
  currentView,
  expiredRentCount = 0,
  onViewChange,
  onNavigate,
  className,
  itemClassName,
  variant = "sidebar",
}: DriveNavListProps) {
  const items = buildDriveNavItems(expiredRentCount);

  return (
    <nav aria-label="Drive sections" className={cn("space-y-1", className)}>
      {items.map((item) => {
        const Icon = item.icon;
        const isActive = item.view === currentView;
        return (
          <button
            key={item.view}
            type="button"
            aria-current={isActive ? "page" : undefined}
            onClick={() => {
              onViewChange(item.view);
              onNavigate?.();
            }}
            className={cn(
              "flex w-full items-center gap-3 text-left text-sm transition-colors",
              variant === "drawer"
                ? cn(
                    "rounded-xl border px-4 py-3.5",
                    isActive
                      ? "border-sky-400/55 bg-sky-500/10 text-foreground"
                      : "border-[hsl(223,22%,22%)] bg-[hsl(222,29%,10%)] text-muted-foreground hover:border-sky-400/35 hover:text-foreground",
                  )
                : cn(
                    "rounded-lg px-3 py-2.5",
                    isActive
                      ? "bg-primary/20 text-primary"
                      : "text-muted-foreground hover:bg-secondary/70 hover:text-foreground",
                  ),
              itemClassName,
            )}
          >
            <Icon className="h-4 w-4 shrink-0" />
            <span className="flex-1">{item.label}</span>
            {item.badge != null ? (
              <span
                className={cn(
                  "rounded-full px-2 py-0.5 text-[10px] font-semibold tabular-nums",
                  item.badge > 0
                    ? "bg-amber-500/20 text-amber-100"
                    : "bg-secondary/80 text-muted-foreground",
                )}
              >
                {item.badge}
              </span>
            ) : null}
          </button>
        );
      })}
    </nav>
  );
}

type SidebarProps = {
  currentView: DriveView;
  expiredRentCount?: number;
  onViewChange: (view: DriveView) => void;
};

export function Sidebar({ currentView, expiredRentCount = 0, onViewChange }: SidebarProps) {
  return (
    <aside className="hidden h-full w-64 shrink-0 border-r border-border/70 bg-card/40 p-4 lg:block">
      <DriveNavList
        currentView={currentView}
        expiredRentCount={expiredRentCount}
        onViewChange={onViewChange}
      />
    </aside>
  );
}
