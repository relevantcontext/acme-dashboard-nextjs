import SideNav from '@/app/ui/dashboard/sidenav';
import HistoryRefresh from '@/app/ui/history-refresh';
import QuickSearchProvider from '@/app/ui/quick-search/provider';

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    // QuickSearchProvider mounts the Cmd-K listener and overlay once for the
    // whole signed-in app; SideNav and pages stay Server Components passed
    // through as children.
    <QuickSearchProvider>
      <div className="flex h-screen flex-col md:flex-row md:overflow-hidden">
        <HistoryRefresh />
        <div className="w-full flex-none md:w-64">
          <SideNav />
        </div>
        <div className="grow p-6 md:overflow-y-auto md:p-12">{children}</div>
      </div>
    </QuickSearchProvider>
  );
}
