const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  
  await page.route('**/api/auth/me', async route => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        id: 'user-1',
        username: 'testuser',
        email: 'test@example.com'
      })
    });
  });

  await page.route('**/api/repos/active', async route => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        id: 'repo-1',
        name: 'test-repo',
        owner: 'testuser'
      })
    });
  });

  await page.route('**/api/tasks*', async route => {
    if (route.request().method() === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          {
            id: 'task-123456',
            title: 'Test Task for Screenshot',
            status: 'todo',
            priority: 'medium',
            labels: [],
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            identifier: 'TSK-123'
          }
        ])
      });
    } else {
      await route.continue();
    }
  });
  
  await page.goto('http://localhost:3000/?token=dummy');
  await page.waitForTimeout(5000);
  const text = await page.evaluate(() => document.body.innerText);
  console.log(text);
  
  await browser.close();
})();
