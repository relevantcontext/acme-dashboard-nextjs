'use client';

import {
  createContext,
  startTransition,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  useTransition,
} from 'react';
import { saveInvoiceEdits } from '@/app/lib/actions';
import {
  EditableInvoiceField,
  InvoiceDraft,
  InvoiceDraftsMap,
  InvoiceDraftValue,
  InvoiceStatus,
  parseDraftValue,
} from '@/app/lib/invoice-edits';

/**
 * Owns ALL bulk-edit state for the invoices table:
 *
 * - `drafts` — the unsaved per-field overlay, keyed by invoice id.
 * - undo/redo — snapshot stacks of the drafts map; every user gesture
 *   (cell commit, bulk status, discard) is exactly one history entry, so a
 *   bulk action over 20 rows undoes in one step.
 * - `editing` — the in-progress cell editor (which cell + its current text),
 *   lifted here so an editor survives even if its row is remounted or pushed
 *   off the page by a live-event refresh mid-keystroke.
 *
 * WHY THIS LIVES HERE (and not in the table): the table is server-rendered
 * inside a Suspense boundary keyed by query/page/sort, so it remounts on
 * navigation — but this provider sits ABOVE that boundary in the invoices
 * page, in a stable tree position. Live payment events trigger a throttled
 * router.refresh() (see LiveEventsProvider), which re-renders Server
 * Components and merges the new RSC payload WITHOUT remounting client
 * components — so this state, and therefore every unsaved edit, survives both
 * live-event refreshes and search/sort/pagination navigations. The table
 * merely renders fresh server rows with the draft overlay applied on top,
 * which is exactly "external events never clobber unsaved local edits".
 *
 * Saving sends only the changed fields of the changed invoices to one Server
 * Action (one transaction). Invoices and fields the user didn't touch are
 * never written, so external changes that arrived meanwhile on OTHER invoices
 * (or other fields of an edited invoice) are preserved; the action then
 * reuses revalidateInvoiceSurfaces() so every surface reflects the new values
 * immediately (the existing freshness guarantee).
 */

export type EditingCell = {
  id: string;
  field: EditableInvoiceField;
  /** The SERVER value of the field, normalized — committing this exact value removes the draft. */
  base: InvoiceDraftValue;
  /** Current editor text. */
  value: string;
};

type EditsState = {
  drafts: InvoiceDraftsMap;
  undoStack: InvoiceDraftsMap[];
  redoStack: InvoiceDraftsMap[];
};

type EditsAction =
  | { type: 'apply'; drafts: InvoiceDraftsMap }
  | { type: 'undo' }
  | { type: 'redo' }
  | { type: 'reset' };

const INITIAL_STATE: EditsState = { drafts: {}, undoStack: [], redoStack: [] };

function draftsEqual(a: InvoiceDraftsMap, b: InvoiceDraftsMap): boolean {
  const aIds = Object.keys(a);
  if (aIds.length !== Object.keys(b).length) return false;
  return aIds.every((id) => {
    const da = a[id];
    const db = b[id];
    if (!db) return false;
    return (
      da.amount === db.amount && da.date === db.date && da.status === db.status
    );
  });
}

function editsReducer(state: EditsState, action: EditsAction): EditsState {
  switch (action.type) {
    case 'apply': {
      // No-op commits (including the double-fire of Enter-commit + blur)
      // must not pollute history.
      if (draftsEqual(action.drafts, state.drafts)) return state;
      return {
        drafts: action.drafts,
        undoStack: [...state.undoStack, state.drafts],
        redoStack: [],
      };
    }
    case 'undo': {
      if (state.undoStack.length === 0) return state;
      return {
        drafts: state.undoStack[state.undoStack.length - 1],
        undoStack: state.undoStack.slice(0, -1),
        redoStack: [...state.redoStack, state.drafts],
      };
    }
    case 'redo': {
      if (state.redoStack.length === 0) return state;
      return {
        drafts: state.redoStack[state.redoStack.length - 1],
        undoStack: [...state.undoStack, state.drafts],
        redoStack: state.redoStack.slice(0, -1),
      };
    }
    case 'reset':
      return INITIAL_STATE;
  }
}

/** Returns a new drafts map with one field set (or cleared, if value === base). */
function withFieldDraft(
  drafts: InvoiceDraftsMap,
  id: string,
  field: EditableInvoiceField,
  value: InvoiceDraftValue,
  base: InvoiceDraftValue,
): InvoiceDraftsMap {
  const row: InvoiceDraft = { ...(drafts[id] ?? {}) };
  if (value === base) {
    delete row[field];
  } else {
    // The parser guarantees the value matches the field's type.
    (row as Record<string, InvoiceDraftValue>)[field] = value;
  }
  const next = { ...drafts };
  if (Object.keys(row).length === 0) {
    delete next[id];
  } else {
    next[id] = row;
  }
  return next;
}

type InvoiceEditsValue = {
  drafts: InvoiceDraftsMap;
  editedCount: number;
  editing: EditingCell | null;
  startEditing: (
    id: string,
    field: EditableInvoiceField,
    base: InvoiceDraftValue,
    value: string,
  ) => void;
  setEditingValue: (value: string) => void;
  commitEditing: () => void;
  cancelEditing: () => void;
  applyFieldDraft: (
    id: string,
    field: EditableInvoiceField,
    value: InvoiceDraftValue,
    base: InvoiceDraftValue,
  ) => void;
  applyBulkStatus: (
    targets: { id: string; base: InvoiceStatus }[],
    status: InvoiceStatus,
  ) => void;
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  discardAll: () => void;
  saveAll: () => void;
  isSaving: boolean;
  saveError: string | null;
};

const InvoiceEditsContext = createContext<InvoiceEditsValue | null>(null);

export function useInvoiceEdits(): InvoiceEditsValue {
  const value = useContext(InvoiceEditsContext);
  if (!value) {
    throw new Error('useInvoiceEdits must be used within InvoiceEditsProvider');
  }
  return value;
}

export default function InvoiceEditsProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [state, dispatch] = useReducer(editsReducer, INITIAL_STATE);
  const [editing, setEditing] = useState<EditingCell | null>(null);
  // Mirror of `editing` that updates synchronously. Commit and cancel race
  // within one tick (Enter commits, then moving focus fires the input's
  // blur-commit; Escape cancels, then the same blur fires) — the ref lets the
  // second call see the first one already consumed the editor.
  const editingRef = useRef<EditingCell | null>(null);
  const [isSaving, startSaveTransition] = useTransition();
  const [saveError, setSaveError] = useState<string | null>(null);

  const setEditingBoth = useCallback((next: EditingCell | null) => {
    editingRef.current = next;
    setEditing(next);
  }, []);

  const startEditing = useCallback(
    (
      id: string,
      field: EditableInvoiceField,
      base: InvoiceDraftValue,
      value: string,
    ) => {
      setEditingBoth({ id, field, base, value });
    },
    [setEditingBoth],
  );

  const setEditingValue = useCallback(
    (value: string) => {
      const current = editingRef.current;
      if (!current) return;
      setEditingBoth({ ...current, value });
    },
    [setEditingBoth],
  );

  const cancelEditing = useCallback(() => {
    setEditingBoth(null);
  }, [setEditingBoth]);

  const commitEditing = useCallback(() => {
    const current = editingRef.current;
    if (!current) return;
    setEditingBoth(null);
    const parsed = parseDraftValue(current.field, current.value);
    // Unparseable input (empty amount, half-typed date) commits nothing.
    if (parsed === null) return;
    dispatch({
      type: 'apply',
      drafts: withFieldDraft(
        stateRef.current.drafts,
        current.id,
        current.field,
        parsed,
        current.base,
      ),
    });
  }, [setEditingBoth]);

  // Callbacks above need the latest drafts without re-creating on every edit.
  const stateRef = useRef(state);
  stateRef.current = state;

  const applyFieldDraft = useCallback(
    (
      id: string,
      field: EditableInvoiceField,
      value: InvoiceDraftValue,
      base: InvoiceDraftValue,
    ) => {
      dispatch({
        type: 'apply',
        drafts: withFieldDraft(stateRef.current.drafts, id, field, value, base),
      });
    },
    [],
  );

  const applyBulkStatus = useCallback(
    (targets: { id: string; base: InvoiceStatus }[], status: InvoiceStatus) => {
      // One reducer action for the whole range = one undo step.
      let next = stateRef.current.drafts;
      for (const target of targets) {
        next = withFieldDraft(next, target.id, 'status', status, target.base);
      }
      dispatch({ type: 'apply', drafts: next });
    },
    [],
  );

  const undo = useCallback(() => dispatch({ type: 'undo' }), []);
  const redo = useCallback(() => dispatch({ type: 'redo' }), []);

  const discardAll = useCallback(() => {
    // Discard is itself a history entry, so an accidental discard is
    // recoverable with undo.
    setEditingBoth(null);
    dispatch({ type: 'apply', drafts: {} });
  }, [setEditingBoth]);

  const saveAll = useCallback(() => {
    const entries = Object.entries(stateRef.current.drafts);
    if (entries.length === 0) return;
    startSaveTransition(async () => {
      setSaveError(null);
      const result = await saveInvoiceEdits(
        entries.map(([id, fields]) => ({ id, fields })),
      );
      // State updates after an await are not automatically part of the
      // transition — wrap them so clearing the overlay batches with the
      // revalidated server render arriving from the action (no flicker of
      // pre-save values).
      startTransition(() => {
        if (result.ok) {
          dispatch({ type: 'reset' });
        } else {
          setSaveError(result.message);
        }
      });
    });
  }, []);

  // Global undo/redo: Ctrl/Cmd-Z and Shift-Ctrl/Cmd-Z. Skipped while focus is
  // in a text-editing element (including our own cell editors) so the
  // browser's native input undo keeps working there.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== 'z')
        return;
      const target = event.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable)
      ) {
        return;
      }
      event.preventDefault();
      if (event.shiftKey) {
        dispatch({ type: 'redo' });
      } else {
        dispatch({ type: 'undo' });
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const value = useMemo<InvoiceEditsValue>(
    () => ({
      drafts: state.drafts,
      editedCount: Object.keys(state.drafts).length,
      editing,
      startEditing,
      setEditingValue,
      commitEditing,
      cancelEditing,
      applyFieldDraft,
      applyBulkStatus,
      undo,
      redo,
      canUndo: state.undoStack.length > 0,
      canRedo: state.redoStack.length > 0,
      discardAll,
      saveAll,
      isSaving,
      saveError,
    }),
    [
      state,
      editing,
      startEditing,
      setEditingValue,
      commitEditing,
      cancelEditing,
      applyFieldDraft,
      applyBulkStatus,
      undo,
      redo,
      discardAll,
      saveAll,
      isSaving,
      saveError,
    ],
  );

  return (
    <InvoiceEditsContext.Provider value={value}>
      {children}
    </InvoiceEditsContext.Provider>
  );
}
