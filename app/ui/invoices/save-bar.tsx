'use client';

import { useInvoiceEdits } from '@/app/ui/invoices/edits-provider';
import {
  ArrowUturnLeftIcon,
  ArrowUturnRightIcon,
} from '@heroicons/react/24/outline';

/**
 * Floating bar shown while unsaved invoice edits exist. Counts edited
 * INVOICES (drafts can span pages/sorts/searches — the count includes rows not
 * currently visible). Save All persists every draft in one batch Server
 * Action; Discard reverts them all (undoably). Undo/redo buttons mirror the
 * Ctrl/Cmd-Z and Shift-Ctrl/Cmd-Z shortcuts.
 */
export default function InvoiceSaveBar() {
  const {
    editedCount,
    isSaving,
    saveError,
    saveAll,
    discardAll,
    undo,
    redo,
    canUndo,
    canRedo,
  } = useInvoiceEdits();

  if (editedCount === 0 && !isSaving) return null;

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-4 z-40 flex justify-center px-4">
      <div
        data-testid="save-bar"
        className="pointer-events-auto flex flex-wrap items-center gap-3 rounded-lg bg-gray-900 px-5 py-3 text-sm text-white shadow-xl"
      >
        <span data-testid="edited-count">
          {editedCount} invoice{editedCount === 1 ? '' : 's'} edited
        </span>
        <span className="flex items-center gap-1">
          <button
            type="button"
            onClick={undo}
            disabled={!canUndo || isSaving}
            title="Undo (Ctrl/Cmd-Z)"
            aria-label="Undo"
            className="rounded-md p-1 hover:bg-gray-700 disabled:opacity-40"
          >
            <ArrowUturnLeftIcon className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={redo}
            disabled={!canRedo || isSaving}
            title="Redo (Shift-Ctrl/Cmd-Z)"
            aria-label="Redo"
            className="rounded-md p-1 hover:bg-gray-700 disabled:opacity-40"
          >
            <ArrowUturnRightIcon className="h-4 w-4" />
          </button>
        </span>
        {saveError && <span className="text-red-300">{saveError}</span>}
        <button
          type="button"
          onClick={saveAll}
          disabled={isSaving}
          className="rounded-md bg-blue-500 px-4 py-1.5 font-medium hover:bg-blue-400 disabled:opacity-60"
        >
          {isSaving ? 'Saving…' : 'Save All'}
        </button>
        <button
          type="button"
          onClick={discardAll}
          disabled={isSaving}
          className="rounded-md border border-gray-600 px-4 py-1.5 hover:bg-gray-700 disabled:opacity-60"
        >
          Discard
        </button>
      </div>
    </div>
  );
}
