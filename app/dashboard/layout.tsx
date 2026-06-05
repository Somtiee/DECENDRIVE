import { Suspense } from "react";

import { DriveSearchProvider } from "@/components/drive/DriveSearchProvider";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={<div className="p-6 text-sm text-muted-foreground">Loading drive…</div>}>
      <DriveSearchProvider>{children}</DriveSearchProvider>
    </Suspense>
  );
}
