import Link from "next/link";
import { IconCircleCheck, IconSparkles } from "@tabler/icons-react";

export default async function StripeSuccessPage({
  searchParams,
}: {
  searchParams: Promise<{ return?: string }>;
}) {
  const { return: returnPath } = await searchParams;
  const safeReturn = returnPath && returnPath.startsWith("/") ? returnPath : "/dashboard";

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm rounded-2xl border bg-card p-8 flex flex-col items-center gap-5 text-center shadow-sm">
        <div className="size-16 rounded-2xl bg-green-500/10 flex items-center justify-center">
          <IconCircleCheck className="size-8 text-green-600" />
        </div>
        <div>
          <h1 className="text-xl font-bold">Payment successful</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Your credits have been added to your account. They are available immediately.
          </p>
        </div>
        <div className="flex items-center gap-1.5 text-sm text-violet-600">
          <IconSparkles className="size-4" />
          Credits added to your balance
        </div>
        <Link
          href={safeReturn}
          className="mt-2 inline-flex h-9 w-full items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground shadow hover:bg-primary/90 transition-colors"
        >
          Back to billing
        </Link>
      </div>
    </div>
  );
}
