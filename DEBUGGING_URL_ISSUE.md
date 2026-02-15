# Debugging URL Issue with Snoozed TODO Tabs

## The Problem
When snoozing a TODO/reminder tab and it wakes up, the URL shows just:
`chrome-extension://kgnigbfnfjgpfaiaafcbgdkpalapiinb/`

Instead of the full URL with the todo text like:
`chrome-extension://kgnigbfnfjgpfaiaafcbgdkpalapiinb/index.html#/todo?color=0&text=My_Todo`

## Changes Made

I've added the following improvements to help diagnose and fix the issue:

### 1. Enhanced Logging in `snooze.js`
- Logs the tab information before snoozing
- Validates that the URL is not empty before saving
- Throws an error if trying to snooze a tab with an empty URL

### 2. Enhanced Logging in `wakeup.js`
- Logs each tab's URL and length before waking up
- Validates that URLs are not empty
- Throws a descriptive error if a tab has an empty URL

### 3. Enhanced `getActiveTab()` in `utils.js`
- Checks if an active tab was found
- Validates that the tab has a URL
- Attempts to refresh the tab info if URL is missing
- Throws descriptive errors for debugging

### 4. Debug Script
A debug script (`debug-storage.js`) has been created to inspect stored snoozed tabs.

## How to Debug

### Step 1: Check Current Snoozed Tabs
1. Open the extension (click the extension icon or go to any extension page)
2. Open the browser console (F12)
3. Run the debug script:
   ```javascript
   // Copy and paste the contents of debug-storage.js into the console
   ```

This will show you all currently snoozed tabs and highlight any that have malformed URLs.

### Step 2: Test Snoozing a TODO Tab
1. Create a new TODO tab (Ctrl+Shift+1 or from the extension popup)
2. Type some text in the TODO
3. Open the browser console (F12) and go to the "Console" tab
4. Click the snooze button and select a time
5. Check the console logs - you should see:
   - "Tab to snooze:" with the full URL
   - "Snoozing tab until..."

   If you see an error like "Tab URL is empty!", that's the problem!

### Step 3: Check When Tab Wakes Up
1. Wait for the snoozed tab to wake up (or snooze it for 1 minute to test quickly)
2. Check the console logs - you should see:
   - "Tab 1 to wake up:" with the URL and URL length
   - "Waking up X tabs"

   If you see an error, it will tell you which tab has an issue.

## Possible Root Causes

### 1. Popup Opening Issue (Manifest V3)
In Manifest V3, the popup behavior changed. When the popup opens, it might not correctly identify the "active tab", especially for extension pages.

**Potential Fix**: Open the TODO tab in a regular browser tab (not as a popup), then try snoozing it.

### 2. React Router Update Timing
The TODO page uses React Router which updates the URL via `history.replace()`. If you snooze too quickly after creating the TODO, the URL might not be fully updated yet.

**Potential Fix**: Wait a second after typing in the TODO before clicking snooze.

### 3. Tab Permissions Issue
Although the extension has the right permissions, Manifest V3 might have different behavior for reading extension tab URLs.

**Potential Fix**: This would require deeper investigation and possibly a change in how extension pages handle their URLs.

## Immediate Workaround

If you need to snooze TODO/reminders right now:

1. Instead of using the extension's TODO feature, create a regular web page (like a Google Doc or note-taking app) with your reminder
2. Snooze that tab instead
3. The issue only affects extension TODO pages, not regular web pages

## Next Steps

If the logging reveals that the URL is empty at snooze time:
- We need to investigate how the popup gets the active tab in Manifest V3
- We might need to pass the tab URL explicitly from the TODO page to the popup
- We might need to use a different method to identify the tab to snooze

If the URL is correct at snooze time but wrong at wake time:
- We need to investigate if there's a storage corruption issue
- We might need to add data migration or validation when reading from storage
