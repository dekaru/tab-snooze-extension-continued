// @flow

import './debugStorage';

export const STORAGE_KEY_TS_VERSION = 'tsVersion';
export const STORAGE_KEY_TAB_COUNT = 'tabsCount';
export const STORAGE_KEY_SNOOZED_TABS = 'snoozedTabs';
export const STORAGE_KEY_SERVER_CONFIG = 'serverConfig';
export const STORAGE_KEY_BACKUPS = 'backups';
export const STORAGE_KEY_UNDO_STACK = 'undoStack';

// version 2.0
// export const STORAGE_KEY_TAB_COUNT = 'tabsCount';
// export const STORAGE_KEY_HISTORY = 'history';

/*
    Storage sync has a QUOTA_BYTES_PER_ITEM of 4000, so we save
    each tab in a different key... instead of one big array :( it's sad
*/
export async function getSnoozedTabs(): Promise<Array<SnoozedTab>> {
  const { snoozedTabs } = await chrome.storage.local.get(
    STORAGE_KEY_SNOOZED_TABS
  );

  return snoozedTabs || [];
}

export function saveSnoozedTabs(
  snoozedTabs: Array<SnoozedTab>
): Promise<void> {
  return chrome.storage.local.set({
    [STORAGE_KEY_SNOOZED_TABS]: snoozedTabs,
  });
}

// export function getSnoozeHistory() {
//   return chrome.storage.local
//     .get()
//     .then(allStorage => allStorage.snoozeHistory || []);
// }

// export async function addTabToHistory(tabInfo) {
//   const history = await getSnoozeHistory();
//   history.push(tabInfo);

//   chrome.storage.local.set({ snoozeHistory: history });

//   return history;
// }

// Undo stack for recently awakened tabs
const MAX_UNDO_STACK_SIZE = 10;

export async function getUndoStack(): Promise<Array<any>> {
  const { undoStack } = await chrome.storage.session.get(STORAGE_KEY_UNDO_STACK);
  return undoStack || [];
}

export async function addToUndoStack(snoozedTab: SnoozedTab): Promise<void> {
  const stack = await getUndoStack();

  // Add timestamp when awakened
  const undoItem = {
    ...snoozedTab,
    awokenAt: Date.now(),
  };

  // Add to front of stack
  stack.unshift(undoItem);

  // Keep only last MAX_UNDO_STACK_SIZE items
  const trimmedStack = stack.slice(0, MAX_UNDO_STACK_SIZE);

  await chrome.storage.session.set({
    [STORAGE_KEY_UNDO_STACK]: trimmedStack,
  });
}

export async function popFromUndoStack(): Promise<any | null> {
  const stack = await getUndoStack();

  if (stack.length === 0) {
    return null;
  }

  const item = stack[0];
  const remainingStack = stack.slice(1);

  await chrome.storage.session.set({
    [STORAGE_KEY_UNDO_STACK]: remainingStack,
  });

  return item;
}

export async function clearUndoStack(): Promise<void> {
  await chrome.storage.session.set({
    [STORAGE_KEY_UNDO_STACK]: [],
  });
}
