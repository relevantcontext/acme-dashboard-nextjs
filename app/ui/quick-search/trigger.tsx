'use client';

import { MagnifyingGlassIcon } from '@heroicons/react/24/outline';
import { useQuickSearch } from '@/app/ui/quick-search/provider';

/**
 * Sidebar affordance for the global quick-search. Styled like the nav links
 * next to it; opening goes through the provider context so this stays a dumb
 * button.
 */
export default function QuickSearchTrigger() {
  const { open } = useQuickSearch();

  return (
    <button
      type="button"
      onClick={open}
      className="flex h-[48px] w-full grow items-center justify-center gap-2 rounded-md bg-gray-50 p-3 text-sm font-medium hover:bg-sky-100 hover:text-blue-600 md:flex-none md:justify-start md:p-2 md:px-3"
    >
      <MagnifyingGlassIcon className="w-6" />
      <p className="hidden md:block">Search</p>
      <kbd className="ml-auto hidden rounded border border-gray-200 bg-white px-1.5 py-0.5 text-xs text-gray-500 md:block">
        ⌘K
      </kbd>
    </button>
  );
}
