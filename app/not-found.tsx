import Link from "next/link";

import { Button } from "@/components/ui/button";

export default function NotFoundPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="w-full max-w-lg rounded-xl border border-border bg-card/80 p-6">
        <h1 className="text-lg font-semibold">Page not found</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          The page you requested does not exist.
        </p>
        <Button asChild className="mt-4">
          <Link href="/dashboard">Back to Drive</Link>
        </Button>
      </div>
    </div>
  );
}
