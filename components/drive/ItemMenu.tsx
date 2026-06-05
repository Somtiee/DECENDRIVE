"use client";

import { MoreVertical } from "lucide-react";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ComponentType,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";

export type MenuItem = {
  label: string;
  icon?: ComponentType<{ className?: string }>;
  onClick: () => void;
  destructive?: boolean;
  disabled?: boolean;
};

type ItemMenuProps = {
  items: MenuItem[];
  trigger?: ReactNode;
  align?: "left" | "right";
};

const MENU_WIDTH = 208;
const MENU_GAP = 8;
const VIEWPORT_PAD = 8;

export function ItemMenu({ items, trigger, align = "right" }: ItemMenuProps) {
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const place = useCallback(() => {
    const button = triggerRef.current;
    const menu = menuRef.current;
    if (!button) {
      return;
    }

    const rect = button.getBoundingClientRect();
    const menuHeight = menu?.offsetHeight ?? items.length * 40 + 8;
    const menuWidth = menu?.offsetWidth ?? MENU_WIDTH;

    const spaceBelow = window.innerHeight - rect.bottom - VIEWPORT_PAD;
    const spaceAbove = rect.top - VIEWPORT_PAD;
    const openUp = spaceBelow < menuHeight + MENU_GAP && spaceAbove > spaceBelow;

    let top = openUp ? rect.top - menuHeight - MENU_GAP : rect.bottom + MENU_GAP;
    top = Math.max(VIEWPORT_PAD, Math.min(top, window.innerHeight - menuHeight - VIEWPORT_PAD));

    let left = align === "right" ? rect.right - menuWidth : rect.left;
    left = Math.max(VIEWPORT_PAD, Math.min(left, window.innerWidth - menuWidth - VIEWPORT_PAD));

    setCoords({ top, left });
  }, [align, items.length]);

  useLayoutEffect(() => {
    if (!open) {
      setCoords(null);
      return;
    }
    place();
    const frame = requestAnimationFrame(() => place());
    return () => cancelAnimationFrame(frame);
  }, [open, place, items]);

  useEffect(() => {
    if (!open) {
      return;
    }
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (triggerRef.current?.contains(target) || menuRef.current?.contains(target)) {
        return;
      }
      setOpen(false);
    };
    const onReposition = () => place();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
      }
    };
    window.addEventListener("mousedown", onPointerDown);
    window.addEventListener("scroll", onReposition, true);
    window.addEventListener("resize", onReposition);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onPointerDown);
      window.removeEventListener("scroll", onReposition, true);
      window.removeEventListener("resize", onReposition);
      window.removeEventListener("keydown", onKey);
    };
  }, [open, place]);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          setOpen((prev) => !prev);
        }}
        className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground transition duration-200 hover:bg-sky-500/15 hover:text-sky-300 hover:shadow-[0_0_14px_rgba(56,189,248,0.35)] data-[open=true]:bg-sky-500/20 data-[open=true]:text-sky-300"
        data-open={open}
        aria-label="More actions"
        aria-haspopup="menu"
        aria-expanded={open}
      >
        {trigger ?? <MoreVertical className="h-4 w-4" />}
      </button>

      {open &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            ref={menuRef}
            role="menu"
            style={{
              position: "fixed",
              top: coords?.top ?? -9999,
              left: coords?.left ?? -9999,
              width: MENU_WIDTH,
              visibility: coords ? "visible" : "hidden",
            }}
            className="z-[200] overflow-hidden rounded-xl border border-slate-600/80 bg-[#0b1018] py-1 shadow-[0_0_0_1px_rgba(56,189,248,0.12),0_0_28px_rgba(15,23,42,0.9),0_12px_40px_rgba(0,0,0,0.55)]"
            onClick={(event) => event.stopPropagation()}
          >
            {items.map((item, index) => {
              const Icon = item.icon;
              return (
                <button
                  key={`${item.label}-${index}`}
                  type="button"
                  role="menuitem"
                  disabled={item.disabled}
                  onClick={() => {
                    setOpen(false);
                    item.onClick();
                  }}
                  className={`flex w-full items-center gap-2.5 px-3 py-2.5 text-left text-sm transition duration-150 disabled:cursor-not-allowed disabled:opacity-40 ${
                    item.destructive
                      ? "text-rose-400 hover:bg-rose-500/15 hover:shadow-[inset_0_0_20px_rgba(244,63,94,0.08)]"
                      : "text-slate-200 hover:bg-sky-500/10 hover:text-white"
                  }`}
                >
                  {Icon && <Icon className="h-4 w-4 shrink-0 opacity-90" />}
                  <span className="truncate">{item.label}</span>
                </button>
              );
            })}
          </div>,
          document.body,
        )}
    </>
  );
}
