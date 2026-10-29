import { expect, test, type Page } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  page.on('dialog', (d) => void (d.type() === 'prompt' ? d.accept('DELETE') : d.accept()));
  await page.goto('/');
});

async function go(page: Page, name: string) {
  await page.getByRole('navigation', { name: 'main' }).getByRole('link', { name }).click();
}

test('library → plan → workout → double progression → next session uses new load', async ({ page }) => {
  await page.getByRole('button', { name: /Add starter library/ }).click();
  await go(page, 'Exercises');
  await expect(page.getByText(/41 exercises/)).toBeVisible();

  await go(page, 'Plans');
  await page.getByRole('button', { name: '+ New plan' }).click();
  await page.getByLabel('Plan name').fill('Push');
  await page.getByRole('button', { name: '+ Add day' }).click();
  for (const name of ['Treadmill Warm-up', 'Machine Chest Press']) {
    await page.getByRole('button', { name: '+ Add exercise' }).click();
    await page.getByPlaceholder('Search by name, alias or tag').fill(name);
    await page.getByRole('dialog').getByRole('button', { name: new RegExp(`^${name}`) }).click();
  }
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await page.getByRole('button', { name: /Start this day/ }).click();

  const warm = page.getByRole('region', { name: 'Treadmill Warm-up' });
  await warm.getByRole('button', { name: '✓ Done' }).click();
  const chest = page.getByRole('region', { name: 'Machine Chest Press' });
  for (let i = 1; i <= 3; i++) {
    await chest.getByLabel(`Reps ${i}`, { exact: true }).fill('12');
    await chest.getByRole('button', { name: '✓ Done' }).first().click();
  }
  await expect(chest.getByText('3/3 sets')).toBeVisible();
  await page.getByRole('button', { name: '✓ Finish workout' }).click();

  await expect(page.getByText('No progression configured')).toBeVisible();
  await expect(page.getByText('Increase recommended').first()).toBeVisible();
  await page.getByRole('button', { name: 'Accept 22.5 kg' }).click();
  await expect(page.getByText('Accepted')).toBeVisible();

  await go(page, 'Home');
  await page.getByRole('button', { name: 'Start', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Machine Chest Press' }).getByLabel('Load 1', { exact: true })).toHaveValue('22.5');
  await expect(page.getByText(/Last time: 12 × 20 kg/)).toBeVisible();
});

test('custom exercise with duration measurement and its own progression', async ({ page }) => {
  await go(page, 'Exercises');
  await page.getByRole('link', { name: '+ New exercise' }).click();
  await page.getByLabel('Name', { exact: true }).fill('Wall sit');
  await page.getByLabel('Measurement type').selectOption('duration');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Wall sit' })).toBeVisible();
  await expect(page.getByText('Duration progression')).toBeVisible();
  await expect(page.getByText(/Duration \(s\)/)).toBeVisible();
});

test('demo data → analysis → export → delete all → import restores data', async ({ page }) => {
  await go(page, 'Settings');
  await page.getByRole('button', { name: 'Load demo data' }).click();
  await expect(page.getByText('Demo data added.')).toBeVisible();

  await go(page, 'Analysis');
  await expect(page.getByRole('heading', { name: 'Overview' })).toBeVisible();
  await expect(page.getByText('Fixed').first()).toBeVisible();
  await page.getByRole('combobox', { name: /^Exercise/ }).selectOption({ label: 'Treadmill Walking' });
  await expect(page.getByText('Longest set')).toBeVisible();

  await go(page, 'Settings');
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Full backup (JSON)' }).click();
  const file = await (await download).path();

  await page.getByRole('button', { name: 'Delete all data' }).click();
  await go(page, 'History');
  await expect(page.getByText('No workouts recorded yet.')).toBeVisible();

  await go(page, 'Settings');
  await page.getByLabel('Choose a JSON file').setInputFiles(file);
  await expect(page.getByRole('heading', { name: 'Import preview' })).toBeVisible();
  await page.getByRole('button', { name: 'Import', exact: true }).click();
  await expect(page.getByText('Import completed.')).toBeVisible();
  await go(page, 'History');
  await expect(page.getByRole('list').getByRole('listitem')).toHaveCount(12);
});

test('invalid import file shows an error', async ({ page }) => {
  await go(page, 'Settings');
  await page.getByLabel('Choose a JSON file').setInputFiles({ name: 'x.json', mimeType: 'application/json', buffer: Buffer.from('{"hello":1}') });
  await expect(page.getByText('The file is not a MyGymProgression export.')).toBeVisible();
});

test('language switch to Portuguese', async ({ page }) => {
  await go(page, 'Settings');
  await page.getByLabel('Language').selectOption('pt');
  await expect(page.getByRole('navigation', { name: 'main' }).getByRole('link', { name: 'Início' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Definições' })).toBeVisible();
});
