import SideNav from '@/app/ui/dashboard/sidenav';
import HistoryRefresh from '@/app/ui/history-refresh';
import QuickSearchProvider from '@/app/ui/quick-search/provider';
import LiveEventsProvider from '@/app/ui/live/live-events-provider';

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    // LiveEventsProvider opens the payment-activity stream for the whole
    // signed-in app (and closes it when this layout unmounts on sign-out).
    // It wraps QuickSearchProvider so the overlay can refetch on live events.
    // QuickSearchProvider mounts the Cmd-K listener and overlay once for the
    // whole signed-in app; SideNav and pages stay Server Components passed
    // through as children.
    <LiveEventsProvider>
      <QuickSearchProvider>
        <div className="flex h-screen flex-col md:flex-row md:overflow-hidden">
          <HistoryRefresh />
          <div className="w-full flex-none md:w-64">
            <SideNav />
          </div>
          <div className="grow p-6 md:overflow-y-auto md:p-12">{children}</div>
        </div>
      </QuickSearchProvider>
    </LiveEventsProvider>
  );
}
