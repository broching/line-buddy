import Link from "next/link";
import { IconX } from "@tabler/icons-react";

export default async function StripeCancelPage({
  searchParams,
}: {
  searchParams: Promise<{ return?: string }>;
}) {
  const { return: returnPath } = await searchParams;
  const safeReturn = returnPath && returnPath.startsWith("/") ? returnPath : "/dashboard";

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm rounded-2xl border bg-card p-8 flex flex-col items-center gap-5 text-center shadow-sm">
        <div className="size-16 rounded-2xl bg-muted flex items-center justify-center">
          <IconX className="size-8 text-muted-foreground" />
        </div>
        <div>
          <h1 className="text-xl font-bold">Payment cancelled</h1>
          <p className="text-sm text-muted-foreground mt-1">
            No charge was made. You can try again any time.
          </p>
        </div>
        <Link
          href={safeReturn}
          className="mt-2 inline-flex h-9 w-full items-center justify-center rounded-md border bg-background px-4 text-sm font-medium shadow-sm hover:bg-accent transition-colors"
        >
          Back to billing
        </Link>
      </div>
    </div>
  );
}
