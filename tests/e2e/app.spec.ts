import { expect, test, type Page } from '@playwright/test';

const rec = (sid: string, name: string, bodyParts: string[], related: string[] = []) => ({
  sid, slug: `${name.toLowerCase().replace(/ /g, '-')}-${sid}`, url: `https://www.example.com/library/x-${sid}`, name, bodyParts,
  equipment: ['Barbell'], type: 'weight_reps', primary: ['Pectoralis Major Sternal Head'], secondary: ['Triceps Brachii'],
  overview: `${name} overview.`, steps: [`${name} step one.`, `${name} step two.`], tips: [], video: 'abc123', thumb: '', imageUrl: '', related,
});
// A tiny embedded image, as in a library file (docs/data-format.md).
const THUMB = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';
const LIBRARY = {
  format: 'mygymprogression-library',
  version: 1,
  source: 'test',
  fetchedAt: '2026-10-29',
  exercises: [
    rec('1', 'Bench Press', ['Chest'], ['2']),
    rec('2', 'Incline Bench Press', ['Chest']),
    rec('3', 'Barbell Row', ['Back']),
    // The library equivalent of the built-in "Barbell Back Squat" (see BUILTIN_LIBRARY_SLUG).
    { ...rec('90', 'Full Squat', ['Thighs']), slug: 'full-squat-n', thumb: THUMB },
  ],
};

let nativeDialogs: string[] = [];

test.beforeEach(async ({ page }) => {
  // All messages must use the in-app dialog; a browser alert/confirm/prompt fails the test.
  nativeDialogs = [];
  page.on('dialog', (d) => void (nativeDialogs.push(d.message()), d.dismiss()));
  await page.goto('/');
});

test.afterEach(() => expect(nativeDialogs).toEqual([]));

test('in-app confirmation: cancel keeps the workout, confirm discards it', async ({ page }) => {
  await page.getByRole('button', { name: 'Try with example data' }).click();
  await page.getByRole('button', { name: /Start workout/ }).click();
  await page.getByRole('button', { name: 'Workout options' }).click();
  await page.getByRole('button', { name: 'Discard workout' }).click();
  const confirm = page.getByRole('dialog', { name: 'Confirm' });
  await confirm.getByRole('button', { name: 'Cancel' }).click();
  await expect(confirm).toHaveCount(0);
  await expect(page.getByRole('tablist')).toBeVisible();
  await page.getByRole('button', { name: 'Discard workout' }).click();
  await confirm.getByRole('button', { name: 'Discard workout' }).click();
  await expect(page.getByText('Next workout')).toBeVisible();
});

async function importLibraryFile(page: Page, data: unknown = LIBRARY) {
  await more(page, /^Settings/);
  await page.getByLabel('Import library file').setInputFiles({ name: 'mygymprogression-library.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(data)) });
}

test('the app does not load a library by itself', async ({ page }) => {
  await more(page, /^Exercises/);
  await expect(page.getByRole('button', { name: 'Add starter exercises' })).toBeVisible();
});

test('library file: existing exercises get the embedded image', async ({ page }) => {
  await page.getByRole('button', { name: 'Add starter exercises' }).click();
  await more(page, /^Exercises/);
  await page.getByRole('searchbox').fill('Barbell Back Squat');
  await expect(page.getByRole('link', { name: /Barbell Back Squat/ }).locator('img.thumb')).toHaveCount(0);
  await importLibraryFile(page);
  await expect(page.getByText(/added, \d+ updated\./)).toBeVisible();
  await more(page, /^Exercises/);
  await page.getByRole('searchbox').fill('Barbell Back Squat');
  await expect(page.getByRole('link', { name: /Barbell Back Squat/ }).first().locator('img.thumb')).toHaveAttribute('src', THUMB);
});

test('library file: a file that is not a library shows an error', async ({ page }) => {
  await importLibraryFile(page, { hello: 'world' });
  await expect(page.getByText('This file is not an exercise library.')).toBeVisible();
});

test('library file: muscle groups, detail with how-to, video and related exercises', async ({ page }) => {
  await importLibraryFile(page);
  await expect(page.getByText('4 added, 0 updated.')).toBeVisible();
  await more(page, /^Exercises/);
  await expect(page.getByRole('heading', { name: 'Muscle groups' })).toBeVisible();
  await page.getByRole('tab', { name: /Chest/ }).click();
  await page.getByRole('link', { name: /^Bench Press/ }).click();
  await expect(page.getByRole('heading', { name: 'Bench Press', level: 1 })).toBeVisible();
  await expect(page.getByText('Bench Press overview.')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'How to do it' })).toBeVisible();
  await expect(page.getByText('Bench Press step two.')).toBeVisible();
  await expect(page.getByRole('link', { name: '▶ Watch video' })).toHaveAttribute('href', 'https://www.youtube.com/watch?v=abc123');
  await page.getByRole('link', { name: 'Incline Bench Press' }).click();
  await expect(page.getByRole('heading', { name: 'Incline Bench Press', level: 1 })).toBeVisible();
});

async function tab(page: Page, name: 'Home' | 'Train' | 'History' | 'More') {
  await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name }).click();
}
async function more(page: Page, name: RegExp) {
  await tab(page, 'More');
  await page.getByRole('link', { name }).click();
}

/** Creates a one-day plan with the given exercises and starts it. New plans default to Hypertrophy. */
async function planAndStart(page: Page, exercises: string[], goal?: 'Strength') {
  await page.getByRole('button', { name: 'Add starter exercises' }).click();
  await more(page, /^Plans/);
  await page.getByRole('button', { name: '+ New plan' }).click();
  await page.getByLabel('Plan name').fill('Push');
  if (goal) await page.getByRole('radio', { name: goal }).click();
  await page.getByRole('button', { name: '+ Day' }).click();
  for (const name of exercises) {
    await page.getByRole('button', { name: '+ Add exercise' }).click();
    await page.getByPlaceholder('Search by name, other name or tag').fill(name);
    await page.getByRole('dialog').getByRole('button', { name: new RegExp(`^${name}`) }).click();
  }
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await page.getByRole('button', { name: /Start this day/ }).click();
}

async function logChest(page: Page, reps: number[]) {
  const chest = page.getByRole('region', { name: 'Machine Chest Press' });
  for (const r of reps) {
    await chest.getByLabel('Reps', { exact: true }).fill(String(r));
    await chest.getByRole('button', { name: '✓ Set done' }).click();
  }
}

test('hypertrophy: top of the range → choose reps up → next workout 9–13 at the same load', async ({ page }) => {
  await planAndStart(page, ['Treadmill Warm-up', 'Machine Chest Press']);
  await expect(page.getByRole('heading', { name: 'Treadmill Warm-up' })).toBeVisible();
  await page.getByRole('button', { name: '✓ Set done' }).click();
  await page.getByRole('button', { name: 'Next ›' }).click();

  await expect(page.getByText('Do 12 reps in every set → then choose: load 22.5 kg or reps 9–13.')).toBeVisible();
  await logChest(page, [12, 12, 12]);
  await page.getByRole('button', { name: '✓ Finish workout' }).click();

  await expect(page.getByRole('region', { name: 'Treadmill Warm-up' }).getByText('Done as planned', { exact: true })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Machine Chest Press' }).getByText('Ready to progress — load or reps?', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '⬆ Reps 9–13' }).click();
  await expect(page.getByRole('region', { name: 'Machine Chest Press' }).getByText('Reps 9–13 at 20 kg', { exact: true })).toBeVisible();

  await tab(page, 'Home');
  await expect(page.getByText('3 × 9–13 reps · 20 kg')).toBeVisible();
  await page.getByRole('button', { name: /Start workout/ }).click();
  await page.getByRole('tab', { name: 'Machine Chest Press' }).click();
  const chest = page.getByRole('region', { name: 'Machine Chest Press' });
  await expect(chest.getByLabel('Load', { exact: true })).toHaveValue('20');
  await expect(chest.getByText('goal 13').first()).toBeVisible();
});

test('hypertrophy: choose load up → next workout at the new load, goal = range minimum', async ({ page }) => {
  await planAndStart(page, ['Machine Chest Press']);
  await logChest(page, [12, 12, 12]);
  await page.getByRole('button', { name: '✓ Finish workout' }).click();
  await page.getByRole('button', { name: '⬆ Load 22.5 kg' }).click();
  await expect(page.getByRole('region', { name: 'Machine Chest Press' }).getByText('Up to 22.5 kg', { exact: true })).toBeVisible();
  await tab(page, 'Home');
  await page.getByRole('button', { name: /Start workout/ }).click();
  const chest = page.getByRole('region', { name: 'Machine Chest Press' });
  await expect(chest.getByLabel('Load', { exact: true })).toHaveValue('22.5');
  await expect(chest.getByText('goal 8').first()).toBeVisible();
  await expect(chest.getByText('Last time: 12 · 12 · 12 × 20 kg')).toBeVisible();
});

test('strength (fixed 5×5): all sets done → load goes up automatically, undo available', async ({ page }) => {
  await planAndStart(page, ['Machine Chest Press'], 'Strength');
  await expect(page.getByText('5 × 5 reps · 20 kg')).toBeVisible();
  await expect(page.getByText('Do 5 reps in every set → next time 22.5 kg.')).toBeVisible();
  const chest = page.getByRole('region', { name: 'Machine Chest Press' });
  for (let i = 0; i < 5; i++) await chest.getByRole('button', { name: '✓ Set done' }).click();
  await page.getByRole('button', { name: '✓ Finish workout' }).click();
  await expect(page.getByRole('region', { name: 'Machine Chest Press' }).getByText('Up to 22.5 kg', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(page.getByRole('region', { name: 'Machine Chest Press' }).getByText('Kept at 20 kg (increase undone)', { exact: true })).toBeVisible();
});

test('missed reps → asks keep or step back → step back lowers the load', async ({ page }) => {
  await planAndStart(page, ['Machine Chest Press']);
  await logChest(page, [9, 7, 6]);
  await page.getByRole('button', { name: '✓ Finish workout' }).click();
  await expect(page.getByRole('region', { name: 'Machine Chest Press' }).getByText('Missed reps — keep or step back?', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Keep 20 kg' })).toBeVisible();
  await page.getByRole('button', { name: '⬇ Down to 17.5 kg' }).click();
  await expect(page.getByRole('region', { name: 'Machine Chest Press' }).getByText('Down to 17.5 kg', { exact: true })).toBeVisible();
});

test('within the range with skipped set → keeps the load without asking', async ({ page }) => {
  await planAndStart(page, ['Machine Chest Press']);
  await logChest(page, [10, 9]);
  await page.getByRole('button', { name: 'Skip set' }).click();
  await page.getByRole('button', { name: '✓ Finish workout' }).click();
  await expect(page.getByRole('region', { name: 'Machine Chest Press' }).getByText('Keep 20 kg', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: /Down to/ })).toHaveCount(0);
});

test('custom exercise with duration measurement', async ({ page }) => {
  await more(page, /^Exercises/);
  await page.getByRole('link', { name: '+ New exercise' }).click();
  await page.getByLabel('Name', { exact: true }).fill('Wall sit');
  await page.getByLabel('Measurement type').selectOption('duration');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Wall sit' })).toBeVisible();
  await expect(page.getByText('Duration progression')).toBeVisible();
});

test('demo data → analysis → export → delete all → import restores data', async ({ page }) => {
  await page.getByRole('button', { name: 'Try with example data' }).click();
  await expect(page.getByText('Decide for next time')).toBeVisible();

  await more(page, /^Analysis/);
  await expect(page.getByRole('heading', { name: 'By exercise' })).toBeVisible();
  await expect(page.getByRole('link', { name: /Treadmill Warm-up.*Fixed/ })).toBeVisible();
  await expect(page.getByRole('link', { name: /Romanian Deadlift.*50 kg/ })).toBeVisible();
  await tab(page, 'Home');
  await expect(page.getByRole('region', { name: 'Romanian Deadlift' }).getByText('Ready to progress — load or reps?', { exact: true })).toBeVisible();

  await more(page, /^Settings/);
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Full backup (JSON)' }).click();
  const file = await (await download).path();
  await page.getByRole('button', { name: 'Delete all data' }).click();
  await page.getByRole('dialog', { name: 'Confirm' }).getByRole('button', { name: 'Delete' }).click();
  await page.getByRole('dialog', { name: 'Confirm' }).getByRole('textbox').fill('DELETE');
  await page.getByRole('dialog', { name: 'Confirm' }).getByRole('button', { name: 'OK' }).click();
  await tab(page, 'History');
  await expect(page.getByText('No workouts yet.')).toBeVisible();

  await more(page, /^Settings/);
  await page.getByLabel('Choose a JSON file').setInputFiles(file);
  await expect(page.getByRole('heading', { name: 'Import preview' })).toBeVisible();
  await page.getByRole('button', { name: 'Import', exact: true }).click();
  await expect(page.getByText('Import completed.')).toBeVisible();
  await tab(page, 'History');
  await expect(page.getByText('12 workouts')).toBeVisible();
  await expect(page.locator('a.hist-row')).toHaveCount(10);
  await expect(page.getByText('Page 1 of 2')).toBeVisible();
  await page.getByRole('button', { name: 'Next ›' }).click();
  await expect(page.locator('a.hist-row')).toHaveCount(2);
  await expect(page.getByRole('button', { name: 'Next ›' })).toBeDisabled();
});

test('invalid import file shows an error', async ({ page }) => {
  await more(page, /^Settings/);
  await page.getByLabel('Choose a JSON file').setInputFiles({ name: 'x.json', mimeType: 'application/json', buffer: Buffer.from('{"hello":1}') });
  await expect(page.getByText('The file is not a MyGymProgression export.')).toBeVisible();
});

test('language switch to Portuguese', async ({ page }) => {
  await more(page, /^Settings/);
  await page.getByLabel('Language').selectOption('pt');
  await expect(page.getByRole('navigation', { name: 'Principal' }).getByRole('link', { name: 'Início' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Definições' })).toBeVisible();
});
