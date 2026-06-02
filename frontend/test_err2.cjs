const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  
  page.on('console', msg => console.log('CONSOLE:', msg.type(), msg.text()));
  page.on('pageerror', err => console.log('PAGE ERROR:', err.message, err.stack));
  
  await page.goto('http://localhost:4173/account', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);
  
  // Try clicking log in
  try {
    await page.fill('input[placeholder="Username"]', 'testuser');
    await page.fill('input[placeholder="Password"]', 'testpass');
    await page.click('button:has-text("Log In")');
    await page.waitForTimeout(1000);
  } catch (e) {
    console.log("Could not find login fields:", e.message);
  }
  
  await browser.close();
})();
