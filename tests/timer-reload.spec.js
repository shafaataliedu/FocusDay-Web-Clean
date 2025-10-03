const path = require('path');
const { test, expect } = require('@playwright/test');

const STORAGE_KEY = 'focusday.web.clean.v5';

function todayISO(){
  const d = new Date();
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function buildDayWithHourTask(dateISO, hourKey, task){
  const hours = {};
  for(let h=0; h<=23; h++){
    const key = `${String(h).padStart(2, '0')}:00`;
    hours[key] = { slots: [null, null, null, null] };
  }
  hours[hourKey].slots[0] = task;
  return { dateISO, mainGoal: '', backlog: [], hours };
}

function parseDurationToSeconds(text){
  const parts = text.split(':').map(p => parseInt(p, 10));
  if(parts.some(Number.isNaN)) return 0;
  if(parts.length === 3){
    return parts[0] * 3600 + parts[1] * 60 + parts[2];
  }
  if(parts.length === 2){
    return parts[0] * 60 + parts[1];
  }
  return parts[0] || 0;
}

async function getTimerSeconds(page){
  const text = await page.locator('.hour-dropzone .task .timer-time').first().textContent();
  return parseDurationToSeconds(text.trim());
}

test('running timer survives storage reload', async ({ page }) => {
  const file = 'file://' + path.resolve(__dirname, '../index.html');
  const dateISO = todayISO();
  const hourKey = '09:00';
  const task = { id: 'timer-task', text: 'Timed task', done: false, cat: 'work' };
  const day = buildDayWithHourTask(dateISO, hourKey, task);
  const all = { [dateISO]: day };

  await page.addInitScript(({ key, value }) => {
    localStorage.setItem(key, value);
  }, { key: STORAGE_KEY, value: JSON.stringify(all) });

  await page.goto(file);

  const toggle = page.locator(`.hour-dropzone[data-hour="${hourKey}"] .task .timer-btn.toggle`).first();
  await toggle.click();

  await page.waitForTimeout(1200);
  const firstSeconds = await getTimerSeconds(page);
  expect(firstSeconds).toBeGreaterThanOrEqual(1);

  const stored = await page.evaluate(key => localStorage.getItem(key), STORAGE_KEY);
  await page.evaluate(({ key, storedValue }) => {
    localStorage.removeItem(key);
    localStorage.setItem(key, storedValue);
  }, { key: STORAGE_KEY, storedValue: stored });

  await page.reload();

  const toggleAfter = page.locator(`.hour-dropzone[data-hour="${hourKey}"] .task .timer-btn.toggle`).first();
  await expect(toggleAfter).toHaveAttribute('aria-pressed', 'true');

  await page.waitForTimeout(600);
  const secondSeconds = await getTimerSeconds(page);
  expect(secondSeconds).toBeGreaterThanOrEqual(firstSeconds);

  await page.waitForTimeout(1200);
  const thirdSeconds = await getTimerSeconds(page);
  expect(thirdSeconds).toBeGreaterThan(secondSeconds);
});
