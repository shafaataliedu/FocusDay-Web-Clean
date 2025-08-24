const path = require('path');
const { test, expect } = require('@playwright/test');

test('drag preview follows cursor', async ({ page }) => {
  const file = 'file://' + path.resolve(__dirname, '../index.html');
  await page.goto(file);
  // add a task
  await page.fill('#newTaskInput', 'Test task');
  await page.click('#addTaskBtn');
  const locator = page.locator('#backlog .task').first();
  await locator.waitFor();
  const box = await locator.boundingBox();
  const dataTransfer = await page.evaluateHandle(() => new DataTransfer());
  const startX = box.x + 10;
  const startY = box.y + 10;
  await page.dispatchEvent('#backlog .task', 'dragstart', {
    clientX: startX,
    clientY: startY,
    dataTransfer
  });
  const moveX = startX + 50;
  const moveY = startY + 30;
  await page.dispatchEvent('body', 'dragover', {
    clientX: moveX,
    clientY: moveY,
    dataTransfer
  });
  const preview = page.locator('.drag-image');
  const pos = await preview.evaluate(el => ({
    left: parseFloat(el.style.left),
    top: parseFloat(el.style.top)
  }));
  expect(Math.abs(pos.left - moveX)).toBeLessThanOrEqual(2);
  expect(Math.abs(pos.top - moveY)).toBeLessThanOrEqual(2);
});
