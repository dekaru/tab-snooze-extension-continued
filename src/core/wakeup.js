// @flow
import { getSnoozedTabs, saveSnoozedTabs, addToUndoStack } from './storage';

import {
  createTabs,
  notifyUserAboutNewTabs,
  addMinutes,
  areTabsEqual,
  getFirstTabToWakeup,
} from './utils';

import { getSettings } from './settings';

import { SOUND_WAKEUP } from './audio';

import { resnoozePeriodicTab } from './snooze';

import { ensureOffscreenDocument } from "./backgroundMain";

// import bugsnag from '../bugsnag';

// Leading edge debounce: Execute immediately, ignore duplicates for X seconds
function debounce(func, wait) {
  let timeout;
  let canExecute = true;

  return async function executedFunction(...args) {
    // If we can't execute (still in cooldown), skip
    if (!canExecute) {
      console.log('Debounce: Ignoring duplicate alarm during cooldown period');
      return;
    }

    // Execute immediately
    canExecute = false;
    await func(...args);

    // Reset cooldown after wait period
    clearTimeout(timeout);
    timeout = setTimeout(() => {
      canExecute = true;
    }, wait);
  };
}

const WAKEUP_TABS_ALARM_NAME = 'WAKEUP_TABS_ALARM';
const STORAGE_KEY_WAKEUP_THRESHOLD = 'wakeupThreshold';

/*
    This timestamp prevents several alarms from going off at the same
    time and cause tabs to be woken up more than once because of a
    asynchrouneous nature of storage.get/set.
    when alarm goes off, it sets this timestamp to a minute from now, to
    mark that it handles waking up tabs in the next minute.

    Stored in chrome.storage.session to persist across service worker restarts
    (Manifest V3) while still clearing when the browser closes.
*/
async function getWakeupThreshold(): Promise<Date> {
  const result = await chrome.storage.session.get(STORAGE_KEY_WAKEUP_THRESHOLD);
  const wakeupThreshold = result[STORAGE_KEY_WAKEUP_THRESHOLD];
  return wakeupThreshold ? new Date(wakeupThreshold) : new Date(0);
}

async function setWakeupThreshold(date: Date): Promise<void> {
  await chrome.storage.session.set({ [STORAGE_KEY_WAKEUP_THRESHOLD]: date.getTime() });
}

/*
    Delete tabs from storage
*/
export async function deleteSnoozedTabs(
  tabsToDelete: Array<SnoozedTab>
): Promise<void> {
  const snoozedTabs = await getSnoozedTabs();

  // Is given tab marked for deletion?
  const shouldDeleteTab = tab =>
    tabsToDelete.find(tabToDelete =>
      areTabsEqual(tabToDelete, tab)
    ) != null;

  const newSnoozedTabs = snoozedTabs.filter(
    tab => !shouldDeleteTab(tab)
  );

  await saveSnoozedTabs(newSnoozedTabs);

  // reschedule alarm
  await scheduleWakeupAlarm('auto');
}

/*
    Create tabs, notify user, and delete from storage
*/
export async function wakeupTabs(
  tabsToWakeUp: Array<SnoozedTab>,
  makeActive: boolean
): Promise<Array<ChromeTab>> {
  console.log(`Waking up ${tabsToWakeUp.length} tabs`);

  // Validate tabs before waking them up
  tabsToWakeUp.forEach((tab, index) => {
    console.log(`Tab ${index + 1} to wake up:`, {
      title: tab.title,
      url: tab.url,
      urlLength: tab.url ? tab.url.length : 0,
    });

    if (!tab.url || tab.url.trim() === '') {
      console.error('ERROR: Snoozed tab has empty URL!', tab);
      throw new Error(`Cannot wake up tab "${tab.title}" - URL is empty or missing`);
    }
  });

  // Save to undo stack before deleting (skip periodic tabs since they auto-resnooze)
  for (let tab of tabsToWakeUp) {
    if (!tab.period) {
      await addToUndoStack(tab);
    }
  }

  // delete waking tabs from storage
  await deleteSnoozedTabs(tabsToWakeUp);

  // Reschedule repeated tabs, if any
  const periodicTabs = tabsToWakeUp.filter(tab => tab.period);
  for (let tab of periodicTabs) {
    await resnoozePeriodicTab(tab);
  }

  // schedule wakeup for next tabs in list
  await scheduleWakeupAlarm('auto');

  // re-create tabs
  const createdTabs = await createTabs(tabsToWakeUp, makeActive);

  return createdTabs;
}

export async function handleScheduledWakeup(): Promise<void> {
  const settings = await getSettings();
  let snoozedTabs = await getSnoozedTabs();
  let now = new Date();

  // check if tabs for right now already awoken by other alarm.
  const currentThreshold = await getWakeupThreshold();
  if (now <= currentThreshold) {
    return;
  }

  // ****** Fixing a bug in production ***** //
  // ****** THIS SHOULD NOT HAPPEN ***** //
  // ****** THIS SHOULD NOT HAPPEN ***** //
  // ****** THIS SHOULD NOT HAPPEN ***** //
  if (snoozedTabs.findIndex(tab => !tab) !== -1) {
    console.error('Found null in snoozedTabs');
    // Notify bugsnag about this error
    // bugsnag.notify(new Error('Found null in snoozedTabs'), {
    //   metaData: {
    //     storage: {
    //       snoozedTabs,
    //     },
    //   },
    // });

    // TEMP FIX, remove null tabs
    snoozedTabs = snoozedTabs.filter(tab => tab);
  }

  // set wakeupThreshold to a minute in the future to include
  // nearby snoozed tabs.
  const newThreshold = addMinutes(now, 1);
  await setWakeupThreshold(newThreshold);

  let readySleepingTabs = snoozedTabs.filter(
    snoozedTab => new Date(snoozedTab.when) <= newThreshold
  );

  if (readySleepingTabs.length > 0) {
    // create inactive tabs & notify user
    const createdTabs = await wakeupTabs(readySleepingTabs, false);

    // Notify user
    if (settings.showNotifications) {
      // Show desktop notification
      notifyUserAboutNewTabs(readySleepingTabs, createdTabs[0]);
    }

    if (settings.playNotificationSound) {
      console.log('Playing sound in background script');
      // Note: handleScheduledWakeup() is ONLY called in background script

      // ensure offscreen document is created
      await ensureOffscreenDocument();

      // send message to foreground script to play sound
      await chrome.runtime.sendMessage({
        action: 'playAudio',
        sound: SOUND_WAKEUP,
      });
    }
  }
}

/*
    Clear all existing alarms and reschedule new alarms
    based on current snoozedTabs array.
*/
export async function scheduleWakeupAlarm(when: 'auto' | '1min'): Promise<void> {
  await cancelWakeupAlarm();

  const snoozedTabs = await getSnoozedTabs();
  let alarmTime = 0;

  if (snoozedTabs.length === 0) {
    return;
  }

  if (when === 'auto') {
    // Automatically find earliest tab ready to wake up
    const nextTabToWakeup = getFirstTabToWakeup(snoozedTabs);

    alarmTime = nextTabToWakeup.when;
  } else {
    // when === '1min'
    alarmTime = Date.now() + 1000 * 60;
  }

  chrome.alarms.create(WAKEUP_TABS_ALARM_NAME, {
    when: alarmTime,
  });
}

export function cancelWakeupAlarm(): Promise<void> {
  return chrome.alarms.clear(WAKEUP_TABS_ALARM_NAME);
}

/**
 * Init the automatic wake up methods
 */
export function registerEventListeners(): void {
  // Note: registerEventListeners is only called in background script

  // Debounced wakeup handler to prevent multiple rapid invocations
  const debouncedWakeupHandler = debounce(async () => {
    console.log('Alarm fired - waking up ready tabs');

    // wake up ready tabs, if any
    await handleScheduledWakeup();

    // Schedule wakeup for next tabs
    await scheduleWakeupAlarm('auto');
  }, 1000);

  // Wake up tabs on scheduled dates
  chrome.alarms.onAlarm.addListener(async function(alarm) {
    if (alarm.name === WAKEUP_TABS_ALARM_NAME) {
      await debouncedWakeupHandler();
    }
  });

  /*
    After computer sleeps and then wakes, for some reason
    the alarms are not called, so we use idle detection to
    get the callback when system wakes up.
  */
  chrome.idle.onStateChanged.addListener(newState => {
    if (newState === 'active') {
      console.log('System active after idle time');

      // Give 1 mintue for Wifi to connect after login,
      // otherwise created tabs will fail to connect and break
      scheduleWakeupAlarm('1min');
    } else {
      // To avoid waking up a tab during sleep, or immedietly on computer
      // wake up from sleep (active state), we turn off alarms, so that
      // chrome will have time to sync data before waking up a tab twice excidently.
      console.log('System idle - Turning off all alarms.');

      cancelWakeupAlarm();
    }
  });

  // onStorage
  // chrome.storage.onChanged.addListener(() =>
  //   scheduleWakeupAlarm('auto')
  // );
}
