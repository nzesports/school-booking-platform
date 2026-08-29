export function PortalLoading({ label = "Loading portal..." }: { label?: string }) {
  return (
    <main className="min-h-screen bg-[color:var(--page-bg)] px-4 py-6" aria-busy="true">
      <p className="sr-only" aria-live="polite">
        {label}
      </p>
      <div className="mx-auto grid max-w-[1500px] animate-pulse gap-5 xl:grid-cols-[292px_minmax(0,1fr)]">
        <div className="hidden h-[calc(100vh-3rem)] rounded-[30px] bg-white/80 xl:block" />
        <div className="grid content-start gap-5">
          <div className="h-28 rounded-[30px] bg-white/80" />
          <div className="grid gap-4 md:grid-cols-3">
            <div className="h-32 rounded-[24px] bg-white/80" />
            <div className="h-32 rounded-[24px] bg-white/80" />
            <div className="h-32 rounded-[24px] bg-white/80" />
          </div>
          <div className="h-80 rounded-[30px] bg-white/80" />
        </div>
      </div>
    </main>
  );
}
