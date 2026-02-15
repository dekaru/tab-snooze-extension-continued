// Debug script to inspect stored snoozed tabs
// Run this in the browser console on any extension page

async function inspectSnoozedTabs() {
  const { snoozedTabs } = await chrome.storage.local.get('snoozedTabs');

  if (!snoozedTabs || snoozedTabs.length === 0) {
    console.log('No snoozed tabs found');
    return;
  }

  console.log(`Found ${snoozedTabs.length} snoozed tab(s):`);
  console.log('='.repeat(80));

  snoozedTabs.forEach((tab, index) => {
    console.log(`\nTab ${index + 1}:`);
    console.log(`  Title: ${tab.title}`);
    console.log(`  URL: ${tab.url}`);
    console.log(`  URL Length: ${tab.url ? tab.url.length : 'null'}`);
    console.log(`  Favicon: ${tab.favicon}`);
    console.log(`  Type: ${tab.type}`);
    console.log(`  When: ${new Date(tab.when).toString()}`);
    console.log(`  Sleep Start: ${new Date(tab.sleepStart).toString()}`);
    console.log(`  Period: ${tab.period ? JSON.stringify(tab.period) : 'none'}`);

    // Check for empty or malformed URLs
    if (!tab.url) {
      console.warn('  ⚠️  URL is null or undefined!');
    } else if (tab.url.length < 50) {
      console.warn(`  ⚠️  URL seems unusually short: "${tab.url}"`);
    } else if (!tab.url.includes('#')) {
      console.warn('  ⚠️  URL doesn\'t contain a hash (#) - might be missing path!');
    }
  });

  console.log('\n' + '='.repeat(80));
}

// Run the inspection
inspectSnoozedTabs();
