import { chromium } from 'playwright';

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  
  page.on('console', msg => console.log('BROWSER LOG:', msg.text()));
  
  console.log("Navigating to http://localhost:5173...");
  await page.goto('http://localhost:5173');
  
  console.log("Waiting 5 seconds for app to render and log...");
  await page.waitForTimeout(5000);
  
  await browser.close();
})();
