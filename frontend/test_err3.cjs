const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  
  page.on('console', msg => console.log('CONSOLE:', msg.type(), msg.text()));
  page.on('pageerror', err => console.log('PAGE ERROR:', err.message, err.stack));
  
  // Set localStorage before navigating
  await page.goto('http://localhost:4173/');
  await page.evaluate(() => {
    localStorage.setItem('tidal-token', 'mock_token');
    localStorage.setItem('tidal-user', 'mock_user');
  });
  
  await page.goto('http://localhost:4173/account');
  await page.waitForTimeout(2000);
  
  await browser.close();
})();
