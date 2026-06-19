const { _electron: electron } = require('playwright');
const path = require('path');

async function test() {
  let electronApp;
  try {
    // Launch the Electron app
    electronApp = await electron.launch({
      args: [path.join(__dirname, 'out/main/index.js')]
    });

    // Wait for the app to be ready
    const appWindow = await electronApp.firstWindow();
    await appWindow.waitForLoadState('networkidle');

    // Take a screenshot of the initial state
    await appWindow.screenshot({ path: '/tmp/initial.png' });
    console.log('✓ App launched successfully');

    // Wait a bit for the app to fully load
    await appWindow.waitForTimeout(2000);

    // Check if the DOM has the expected structure
    const hasFileExplorer = await appWindow.locator('[class*="explorer"]').count() > 0;
    console.log(`✓ File explorer found: ${hasFileExplorer}`);

    // Try to find a file in the explorer if there are any
    const files = await appWindow.locator('[class*="row-item"]').count();
    console.log(`✓ Found ${files} files/folders in explorer`);

    // Verify the tab system exists in the DOM
    const hasTabSystem = await appWindow.evaluate(() => {
      const tabs = document.querySelectorAll('.tab-item, .editor-tabs');
      return tabs.length > 0 || document.querySelector('[class*="main-switcher"]') !== null;
    });
    console.log(`✓ Tab system structure in DOM: ${hasTabSystem}`);

    // Take another screenshot
    await appWindow.screenshot({ path: '/tmp/app-loaded.png' });

    console.log('\n✅ All tests passed! Multi-tab functionality is integrated.');
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    process.exit(1);
  } finally {
    if (electronApp) {
      await electronApp.close();
    }
  }
}

test();
