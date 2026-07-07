// Instant skeleton shown the moment a portal navigation starts, so clicks
// give feedback while the server render is in flight.
export default function PortalLoading() {
  return (
    <div className="flex min-h-screen bg-[#f4f8fb]">
      <aside className="hidden w-60 shrink-0 border-r border-black/5 bg-white lg:block" />
      <main className="flex-1 space-y-6 px-6 py-8 lg:px-10">
        <div className="h-9 w-64 max-w-full animate-pulse rounded-xl bg-black/10" />
        <div className="h-4 w-96 max-w-full animate-pulse rounded-lg bg-black/5" />
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <div
              key={index}
              className="h-28 animate-pulse rounded-2xl border border-black/5 bg-white"
            />
          ))}
        </div>
        <div className="h-72 animate-pulse rounded-2xl border border-black/5 bg-white" />
        <div className="h-48 animate-pulse rounded-2xl border border-black/5 bg-white" />
      </main>
    </div>
  );
}
