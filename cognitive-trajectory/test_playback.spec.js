import { test, expect } from '@playwright/test';

test('check human playback logs', async ({ page }) => {
  const logs = [];
  page.on('console', msg => {
    logs.push(msg.text());
  });

  await page.goto('http://localhost:5173');
  
  // Wait for models to load
  await page.waitForTimeout(2000);
  
  // Click Replay Conversation button
  // Note: the mock data has at least 2 messages, so Replay should be present
  const replayBtn = page.getByText('REPLAY CONVERSATION');
  if (await replayBtn.isVisible()) {
    await replayBtn.click();
    console.log("Clicked Replay");
  } else {
    console.log("No Replay button found. Chat is probably empty.");
  }
  
  // Wait a bit for playback to run
  await page.waitForTimeout(3000);
  
  console.log("--- BROWSER LOGS ---");
  for (const log of logs) {
    console.log(log);
  }
});
