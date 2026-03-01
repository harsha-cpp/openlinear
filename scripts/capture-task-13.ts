import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

async function main() {
  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
  });
  
  const page = await context.newPage();

  // Mock API responses
  await page.route('**/api/tasks*', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([
        {
          id: 'task-1',
          title: 'Implement feature X',
          status: 'in_progress',
          priority: 'high',
          labels: [],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          executionStartedAt: new Date().toISOString(),
          executionElapsedMs: 5000,
        },
        {
          id: 'task-2',
          title: 'Fix bug Y',
          status: 'in_progress',
          priority: 'medium',
          labels: [],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          executionStartedAt: new Date().toISOString(),
          executionElapsedMs: 10000,
        }
      ])
    });
  });

  await page.route('**/api/auth/me', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ id: 'user-1', username: 'Test User' })
    });
  });

  await page.route('**/api/projects', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([{ id: 'proj-1', name: 'Test Project' }])
    });
  });

  await page.route('**/api/teams', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([])
    });
  });

  await page.route('**/api/repos/active', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ id: 'repo-1', name: 'test/repo', fullName: 'test/repo' })
    });
  });

  await page.route('**/api/inbox/count', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ total: 0, unread: 0 })
    });
  });

  await page.route('**/api/brainstorm/availability', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ available: true })
    });
  });

  await page.route('**/api/events', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'text/event-stream',
      body: 'data: {"type":"connected","data":{"clientId":"test"}}\n\n'
    });
  });

  await page.goto('http://localhost:3000/?token=fake-token');
  
  // Wait for tasks to load
  await page.waitForSelector('text=Implement feature X', { timeout: 10000 });

  // Inject happy state
  await page.evaluate(() => {
    const queue = (window as any).metadataQueue;
    queue.taskStates = {
      'task-1': { status: 'syncing', pendingCount: 1 },
      'task-2': { status: 'synced', pendingCount: 0 }
    };
    queue.notifyListeners();
  });

  // Wait a bit for React to render
  await page.waitForTimeout(1000);

  // Take happy screenshot
  const evidenceDir = path.join(process.cwd(), '.sisyphus/evidence');
  if (!fs.existsSync(evidenceDir)) {
    fs.mkdirSync(evidenceDir, { recursive: true });
  }
  await page.screenshot({ path: path.join(evidenceDir, 'task-13-ui-happy.png') });

  // Inject failure state
  await page.evaluate(() => {
    const queue = (window as any).metadataQueue;
    queue.taskStates = {
      'task-1': { status: 'error', lastError: 'Network error', pendingCount: 1 },
      'task-2': { status: 'error', lastError: 'Network error', pendingCount: 1 }
    };
    queue.notifyListeners();
  });

  // Wait a bit for React to render
  await page.waitForTimeout(1000);

  // Take failure screenshot
  await page.screenshot({ path: path.join(evidenceDir, 'task-13-ui-failure.png') });

  await browser.close();
}

main().catch(console.error);
