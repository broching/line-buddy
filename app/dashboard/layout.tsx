// The [orgSlug] sub-routes provide their own full layout (sidebar + header).
// This layout is kept as a passthrough so those routes aren't double-wrapped.
export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
