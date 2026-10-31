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

test('plan goal is saved; a mixed plan sets the type of each day', async ({ page }) => {
  await page.getByRole('button', { name: 'Add starter exercises' }).click();
  await more(page, /^Plans/);
  await page.getByRole('button', { name: '+ New plan' }).click();
  await page.getByLabel('Plan name').fill('Mix');
  const planGoal = page.getByRole('radiogroup', { name: 'Goal' });
  await planGoal.getByRole('radio', { name: 'Mixed' }).click();
  await page.getByRole('button', { name: '+ Day' }).click();
  const dayGoal = page.getByRole('radiogroup', { name: 'Type of this day' });
  await expect(dayGoal.getByRole('radio', { name: 'Free' })).toHaveAttribute('aria-checked', 'true');
  await dayGoal.getByRole('radio', { name: 'Strength' }).click();
  await page.getByRole('button', { name: '+ Add exercise' }).click();
  await page.getByPlaceholder('Search by name, other name or tag').fill('Machine Chest Press');
  await page.getByRole('dialog').getByRole('button', { name: /^Machine Chest Press/ }).click();
  // A strength day gives the strength default sets (5×5) and the automatic load rule.
  await expect(page.getByLabel('Machine Chest Press Sets')).toHaveValue('5');
  await expect(page.getByText('Load goes up automatically').first()).toBeVisible();
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Saved', exact: true })).toBeVisible();

  await page.reload();
  await expect(planGoal.getByRole('radio', { name: 'Mixed' })).toHaveAttribute('aria-checked', 'true');
  await expect(dayGoal.getByRole('radio', { name: 'Strength' })).toHaveAttribute('aria-checked', 'true');
  // Exercises are listed collapsed, with a summary; tapping one opens its editor.
  const chest = page.getByRole('region', { name: 'Machine Chest Press' });
  await expect(chest).toContainText('5×5 reps');
  await chest.getByRole('button', { expanded: false }).click();
  await expect(page.getByLabel('Machine Chest Press Sets')).toHaveValue('5');
});

test('circuit: built in the plan, done once at the end of the whole circuit', async ({ page }) => {
  await page.getByRole('button', { name: 'Add starter exercises' }).click();
  await more(page, /^Plans/);
  await page.getByRole('button', { name: '+ New plan' }).click();
  await page.getByLabel('Plan name').fill('Circ');
  await page.getByRole('button', { name: '+ Day' }).click();
  await page.getByRole('button', { name: '⟳ Circuit' }).click();
  const block = page.getByRole('region', { name: 'Circuit 1' });
  await block.getByLabel('Circuit 1 Rounds').fill('2');
  for (const name of ['Push-up', 'Plank']) {
    await block.getByRole('button', { name: '+ Exercise in circuit' }).click();
    await page.getByPlaceholder('Search by name, other name or tag').fill(name);
    await page.getByRole('dialog').getByRole('button', { name: new RegExp(`^${name}`) }).click();
  }
  await expect(block.getByRole('region')).toHaveCount(2);
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await page.getByRole('button', { name: /Start this day/ }).click();

  // The whole circuit is one step: both rounds of both exercises, one "done".
  await expect(page.getByRole('tab', { name: 'Circuit 1' })).toHaveAttribute('aria-selected', 'true');
  const circuit = page.getByRole('region', { name: 'Circuit 1' });
  await expect(circuit.getByText('Round 2')).toBeVisible();
  await circuit.getByRole('button', { name: '✓ Circuit done' }).click();
  await expect(circuit.getByRole('button', { name: '✓ Done' })).toBeDisabled();
  await expect(page.getByText('4/4 sets')).toBeVisible();
  await page.getByRole('button', { name: '✓ Finish workout' }).click();
  await expect(page.getByRole('heading', { name: 'Next time' })).toBeVisible();
});

test('join a duplicate exercise: the plan uses the kept one and the old name still finds it', async ({ page }) => {
  await page.getByRole('button', { name: 'Add starter exercises' }).click();
  await more(page, /^Plans/);
  await page.getByRole('button', { name: '+ New plan' }).click();
  await page.getByLabel('Plan name').fill('Push');
  await page.getByRole('button', { name: '+ Day' }).click();
  await page.getByRole('button', { name: '+ Add exercise' }).click();
  await page.getByPlaceholder('Search by name, other name or tag').fill('Machine Chest Press');
  await page.getByRole('dialog').getByRole('button', { name: /^Machine Chest Press/ }).click();
  await page.getByRole('button', { name: 'Save', exact: true }).click();

  await more(page, /^Exercises/);
  await page.getByRole('searchbox').fill('Barbell Bench Press');
  await page.getByRole('link', { name: /^Barbell Bench Press/ }).first().click();
  await page.getByRole('button', { name: '⇆ Join a duplicate' }).click();
  await page.getByPlaceholder('Search by name, other name or tag').fill('Machine Chest Press');
  await page.getByRole('dialog').getByRole('button', { name: /^Machine Chest Press/ }).click();
  const confirm = page.getByRole('dialog', { name: 'Confirm' });
  await expect(confirm).toContainText('1 plans, 0 workouts');
  await confirm.getByRole('button', { name: 'Join', exact: true }).click();
  await page.getByRole('dialog', { name: 'Notice' }).getByRole('button', { name: 'OK' }).click();
  await expect(page.locator('.page-head small')).toContainText('Machine Chest Press'); // now another name

  await more(page, /^Plans/);
  await page.getByRole('link', { name: /^Push/ }).click();
  await expect(page.getByRole('region', { name: 'Barbell Bench Press' })).toBeVisible();
  await more(page, /^Exercises/);
  await page.getByRole('searchbox').fill('Machine Chest Press');
  await expect(page.getByRole('link', { name: /^Barbell Bench Press/ })).toBeVisible();
});

test('personal trainer: off by default; when on, a message shows at the start of a workout and can be closed', async ({ page }) => {
  await page.getByRole('button', { name: 'Try with example data' }).click();
  await page.getByRole('button', { name: /Start workout/ }).click();
  await expect(page.getByRole('note', { name: 'Personal trainer' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Workout options' }).click();
  await page.getByRole('button', { name: 'Discard workout' }).click();
  await page.getByRole('dialog', { name: 'Confirm' }).getByRole('button', { name: 'Discard workout' }).click();

  await more(page, /^Settings/);
  const enable = page.getByLabel('Turn on personal trainer');
  await enable.click();
  await expect(enable).toBeChecked();
  await page.getByLabel('Style').selectOption({ label: 'Sergeant + data' });
  await page.getByRole('button', { name: 'Show an example' }).click();
  await expect(page.getByRole('status', { name: 'Personal trainer' }).locator('.coach-avatar.sergeant')).toBeVisible();
  await tab(page, 'Home');
  await page.getByRole('button', { name: /Start workout/ }).click();
  const note = page.getByRole('note', { name: 'Personal trainer' });
  await expect(note).toBeVisible();
  await note.getByRole('button', { name: 'Close' }).click();
  await expect(note).toHaveCount(0);
});

test('personal trainer outside the workout: greeting on Home and a comment in History, once a day; can be switched off', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-11-02T10:00:00'));
  await page.getByRole('button', { name: 'Try with example data' }).click();
  await page.getByText('Decide for next time').waitFor();
  await more(page, /^Settings/);
  await page.getByLabel('Turn on personal trainer').click();
  const pages = page.getByLabel(/Also speak outside the workout/);
  await expect(pages).toBeChecked();
  await tab(page, 'Home');
  const note = page.getByRole('note', { name: 'Personal trainer' });
  await expect(note).toContainText(/^Good morning!/);
  await tab(page, 'History');
  await expect(note).toBeVisible();
  await tab(page, 'Home');
  await expect(page.getByText('Decide for next time')).toBeVisible();
  await expect(note).toHaveCount(0);

  await page.evaluate(() => localStorage.clear());
  await more(page, /^Settings/);
  await pages.click();
  await expect(pages).not.toBeChecked();
  await tab(page, 'Home');
  await expect(page.getByText('Decide for next time')).toBeVisible();
  await expect(note).toHaveCount(0);
});

test('about: version and what is new', async ({ page }) => {
  await more(page, /^About/);
  await expect(page.getByRole('heading', { name: 'MyGymProgression', level: 1 })).toBeVisible();
  await expect(page.getByText(/^Version \d+\.\d+\.\d+ · built on/)).toBeVisible();
  await expect(page.getByRole('heading', { name: "What's new" })).toBeVisible();
});

test('plan colour without a day colour: the workout buttons use the plan colour; strength has no mode selector', async ({ page }) => {
  await page.getByRole('button', { name: 'Try with example data' }).click();
  await page.getByText('Decide for next time').waitFor();
  await more(page, /^Plans/);
  await page.getByRole('link', { name: /^Demo/ }).click();
  await page.getByRole('radiogroup', { name: 'Plan colour' }).getByRole('radio', { name: 'Teal' }).click();
  await page.getByRole('radiogroup', { name: 'Goal' }).getByRole('radio', { name: 'Strength' }).click();
  await expect(page.getByRole('radiogroup', { name: 'Strength mode' })).toHaveCount(0);
  const confirm = page.getByRole('dialog', { name: 'Confirm' });
  await expect(confirm).toContainText('5×5');
  await confirm.getByRole('button', { name: 'Cancel' }).click();
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await tab(page, 'Home');
  await page.getByRole('button', { name: /Start workout/ }).click();
  await expect(page.getByRole('button', { name: '✓ Set done' })).toHaveCSS('background-color', 'rgb(15, 118, 110)');
});

test('personal trainer "after every exercise": a message appears when an exercise is done', async ({ page }) => {
  await page.getByRole('button', { name: 'Try with example data' }).click();
  await page.getByText('Decide for next time').waitFor();
  await more(page, /^Settings/);
  const enable = page.getByLabel('Turn on personal trainer');
  await enable.click();
  await expect(enable).toBeChecked();
  await page.getByRole('combobox', { name: 'When' }).selectOption({ label: 'After every exercise' });
  await tab(page, 'Home');
  await page.getByRole('button', { name: /Start workout/ }).click();
  await expect(page.getByRole('status', { name: 'Personal trainer' })).toHaveCount(0);
  await page.getByRole('button', { name: '✓ Set done' }).click(); // the warm-up has one set
  await expect(page.getByRole('status', { name: 'Personal trainer' }).locator('.coach-avatar')).toBeVisible();
});

test('analysis: period dates and workouts per week; a week lists its workouts', async ({ page }) => {
  await page.getByRole('button', { name: 'Try with example data' }).click();
  await page.getByText('Decide for next time').waitFor();
  await more(page, /^Analysis/);
  await expect(page.getByRole('heading', { name: 'Workouts per week' })).toBeVisible();
  await expect(page.locator('.period-range')).toContainText('–');
  await page.getByRole('button', { name: /^Week of .*: 2 workouts$/ }).first().click();
  await expect(page.locator('.week-list a')).toHaveCount(2);
  await page.getByRole('tab', { name: '4 wks' }).click();
  await expect(page.getByRole('button', { name: /^Week of / })).toHaveCount(5);
});

test('home: a date opens a window with the plan day set to that weekday, and starts it', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-11-02T10:00:00')); // a Monday: the demo sets day A to Monday
  await page.getByRole('button', { name: 'Try with example data' }).click();
  await page.getByText('Decide for next time').waitFor();
  await page.locator('.week-day.today').click();
  const sheet = page.getByRole('dialog');
  await expect(sheet).toContainText('Planned for this day');
  await expect(sheet.getByRole('heading', { name: 'A · Upper' })).toBeVisible();
  await sheet.getByRole('button', { name: /Start workout/ }).click();
  await expect(page.getByRole('button', { name: '✓ Set done' })).toBeVisible();
});

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
  await page.getByLabel(/Restore or import/).setInputFiles(file);
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
  await page.getByLabel(/Restore or import/).setInputFiles({ name: 'x.json', mimeType: 'application/json', buffer: Buffer.from('{"hello":1}') });
  await expect(page.getByText('The file is not a MyGymProgression export.')).toBeVisible();
});

test('language switch to Portuguese', async ({ page }) => {
  await more(page, /^Settings/);
  await page.getByLabel('Language').selectOption('pt');
  await expect(page.getByRole('navigation', { name: 'Principal' }).getByRole('link', { name: 'Início' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Definições' })).toBeVisible();
});

test('backup: Home warns when there is no backup; saving it removes the warning', async ({ page }) => {
  await page.getByRole('button', { name: 'Try with example data' }).click();
  const warning = page.locator('.card.warn', { hasText: 'No backup yet' });
  await expect(warning).toBeVisible();
  const download = page.waitForEvent('download');
  await warning.getByRole('button', { name: /Save backup/ }).click();
  expect((await download).suggestedFilename()).toMatch(/^mygymprogression-full-.*\.json$/);
  await expect(warning).toHaveCount(0);
  await expect(page.getByText(/^Last backup /)).toBeVisible();
});

test('share a plan by link: the link opens a preview and imports a new copy of the plan', async ({ page }) => {
  // Capture the link instead of opening the system share menu or the clipboard.
  await page.addInitScript(() => {
    const keep = async (u: string) => void ((window as unknown as { shared: string }).shared = u);
    Object.defineProperty(navigator, 'share', { value: (d: ShareData) => keep(d.url ?? '') });
    Object.defineProperty(navigator, 'clipboard', { value: { writeText: keep } });
  });
  await page.reload();
  await page.getByRole('button', { name: 'Try with example data' }).click();
  await more(page, /^Plans/);
  const name = (await page.locator('.nav-row .title').first().innerText()).trim();
  await page.getByRole('button', { name: `Options for ${name}` }).click();
  await page.getByRole('button', { name: 'Share', exact: true }).click();
  await page.getByRole('button', { name: /Share link/ }).click();
  await expect.poll(() => page.evaluate(() => (window as unknown as { shared?: string }).shared)).toContain('#/share?d=');
  const link = await page.evaluate(() => (window as unknown as { shared: string }).shared);
  await page.goto(link);
  await expect(page.getByText('Shared plan')).toBeVisible();
  await expect(page.getByRole('heading', { name })).toBeVisible();
  await expect(page.getByText(/0 new exercises for the library/)).toBeVisible();
  await page.getByRole('button', { name: /Import plan/ }).click();
  await expect(page).toHaveURL(/#\/plans\//);
  await more(page, /^Plans/);
  await expect(page.locator('.nav-row .title', { hasText: name })).toHaveCount(2);
});

test('a damaged share link shows an error', async ({ page }) => {
  await page.goto('/#/share?d=broken');
  await expect(page.getByText('This link is not valid or is incomplete.')).toBeVisible();
});

test('open library: installs from the app, with images for built-in exercises', async ({ page }) => {
  await more(page, /^Settings/);
  await page.getByRole('button', { name: /Install open library/ }).click();
  await expect(page.getByText(/^\d{3} added, 0 updated\.$/)).toBeVisible({ timeout: 30000 });
  await tab(page, 'More');
  await page.getByRole('link', { name: /^Exercises/ }).click();
  await page.getByRole('searchbox').fill('Barbell Squat');
  await expect(page.getByRole('link', { name: /^Barbell Squat/ }).first().locator('img.thumb')).toBeVisible();
});

test('analysis: weekly sets per muscle with the guideline, and comparison with the previous period', async ({ page }) => {
  await page.getByRole('button', { name: 'Try with example data' }).click();
  await page.getByText('Decide for next time').waitFor();
  await more(page, /^Analysis/);
  await expect(page.getByRole('heading', { name: 'Sets per muscle per week' })).toBeVisible();
  await expect(page.locator('.mbar .guide').first()).toBeVisible();
  // 4 weeks: the demo has 6 weeks, so the 4 weeks before have workouts to compare with.
  await page.getByRole('tab', { name: '4 wks' }).click();
  await expect(page.getByText(/^▲▼ compared with /)).toBeVisible();
});

test('pause: the workout stays open; History resumes it', async ({ page }) => {
  await planAndStart(page, ['Machine Chest Press']);
  await logChest(page, [10]);
  await page.getByRole('link', { name: /Pause/ }).click();
  await expect(page.getByText('Workout in progress')).toBeVisible();
  await tab(page, 'History');
  const banner = page.locator('.card.warn', { hasText: 'Paused' });
  await banner.getByRole('button', { name: /Resume workout/ }).click();
  await expect(page.getByRole('button', { name: '✓ Set done' })).toBeVisible();
  // The menu also pauses.
  await page.getByRole('button', { name: 'Workout options' }).click();
  await page.getByRole('button', { name: /Pause — continue later/ }).click();
  await expect(page.getByText('Workout in progress')).toBeVisible();
});

test('interrupted: resume keeps the done sets and reopens the others', async ({ page }) => {
  await planAndStart(page, ['Machine Chest Press']);
  await logChest(page, [10]);
  await page.getByRole('button', { name: 'Workout options' }).click();
  await page.getByRole('button', { name: 'End early (interrupted)' }).click();
  await expect(page.getByText(/· Interrupted$/)).toBeVisible();
  await page.getByRole('button', { name: /Resume workout/ }).click();
  await expect(page.getByText('1/3 sets')).toBeVisible();
  await expect(page.getByRole('button', { name: '✓ Set done' })).toBeVisible();
});

test('correction: not-done sets stand out, and the status can be changed', async ({ page }) => {
  await planAndStart(page, ['Machine Chest Press']);
  await logChest(page, [10]);
  await page.getByRole('button', { name: '✓ Finish workout' }).click();
  await page.getByRole('dialog', { name: 'Confirm' }).getByRole('button', { name: 'OK' }).click();
  await expect(page.getByText('Partially completed')).toBeVisible();
  await page.getByRole('button', { name: 'Correct records' }).click();
  await expect(page.getByText('2 sets not done')).toBeVisible();
  await page.getByLabel('Status').selectOption('completed');
  await page.getByRole('button', { name: 'Save correction' }).click();
  await expect(page.getByText(/· Completed$/)).toBeVisible();
});

test('exercise page: add the exercise to a plan day; a day that has it is marked', async ({ page }) => {
  await page.getByRole('button', { name: 'Add starter exercises' }).click();
  await more(page, /^Plans/);
  await page.getByRole('button', { name: '+ New plan' }).click();
  await page.getByLabel('Plan name').fill('Push');
  await page.getByRole('button', { name: '+ Day' }).click();
  await page.getByRole('button', { name: '+ Add exercise' }).click();
  await page.getByPlaceholder('Search by name, other name or tag').fill('Machine Chest Press');
  await page.getByRole('dialog').getByRole('button', { name: /^Machine Chest Press/ }).click();
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await more(page, /^Exercises/);
  await page.getByPlaceholder('Search by name, other name or tag').fill('Machine Chest Press');
  await page.getByRole('link', { name: /Machine Chest Press/ }).first().click();
  await page.getByRole('button', { name: '＋ Add to plan' }).click();
  const sheet = page.getByRole('dialog', { name: 'Add to plan' });
  await expect(sheet.getByRole('button', { name: /already there/ })).toBeDisabled();
  await page.goBack();
  await page.getByPlaceholder('Search by name, other name or tag').fill('Lat Pulldown');
  await page.getByRole('link', { name: /Lat Pulldown/ }).first().click();
  await page.getByRole('button', { name: '＋ Add to plan' }).click();
  await sheet.getByRole('button', { name: /1 exercise/ }).click();
  await expect(page.getByRole('dialog', { name: 'Notice' })).toContainText('Added to');
  await page.getByRole('dialog', { name: 'Notice' }).getByRole('button', { name: 'OK' }).click();
  await more(page, /^Plans/);
  await page.getByText('Push').first().click();
  await expect(page.getByText('Lat Pulldown').first()).toBeVisible();
  expect(nativeDialogs).toEqual([]);
});

test('games: each game opens and plays; scores are saved and can be reset', async ({ page }) => {
  await page.getByRole('button', { name: 'Add starter exercises' }).click();
  await more(page, /^Games/);
  for (const name of ['Trainer memory', 'Whack-a-PT', 'Guess the muscle', 'Flappy Dumbbell', 'PT Runner', 'Starship']) await expect(page.getByRole('link', { name: new RegExp(`^${name}`) })).toBeVisible();

  await page.getByRole('link', { name: /^Trainer memory/ }).click();
  await page.getByRole('button', { name: /Play/ }).click();
  await expect(page.getByRole('button', { name: /^Card \d+$/ })).toHaveCount(20);
  await page.getByRole('link', { name: '‹ Games' }).click();

  await page.getByRole('link', { name: /^Whack-a-PT/ }).click();
  await page.getByRole('button', { name: /Play/ }).click();
  await expect(page.locator('.whack-hole')).toHaveCount(9);
  await page.getByRole('link', { name: '‹ Games' }).click();

  await page.getByRole('link', { name: /^Guess the muscle/ }).click();
  await page.getByRole('button', { name: /Play/ }).click();
  await expect(page.locator('.muscle-options button')).toHaveCount(4);
  await page.getByRole('link', { name: '‹ Games' }).click();

  // Without input the runner hits the first obstacle: the score is saved.
  await page.getByRole('link', { name: /^PT Runner/ }).click();
  await page.getByRole('button', { name: /Play/ }).click();
  await expect(page.getByLabel('PT Runner')).toBeVisible();
  await expect(page.getByRole('button', { name: /Play again/ })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole('status')).toContainText(' m');
  await expect(page.getByText(/^Best: \d+ m$/)).toBeVisible();

  await page.getByRole('link', { name: '‹ Games' }).click();
  await page.getByRole('link', { name: /^Flappy Dumbbell/ }).click();
  await page.getByRole('button', { name: /Play/ }).click();
  await page.getByLabel('Flappy Dumbbell').click();
  await expect(page.getByRole('button', { name: /Play again/ })).toBeVisible({ timeout: 15_000 });

  await page.getByRole('link', { name: '‹ Games' }).click();
  await page.getByRole('link', { name: /^Starship/ }).click();
  await page.getByRole('button', { name: /Play/ }).click();
  await expect(page.getByLabel('Starship')).toBeVisible();

  await page.getByRole('link', { name: '‹ Games' }).click();
  await expect(page.getByRole('link', { name: /^PT Runner/ })).toContainText('Best:');
  await page.getByRole('button', { name: 'Reset all scores' }).click();
  await page.getByRole('dialog', { name: 'Confirm' }).getByRole('button', { name: 'Reset all scores' }).click();
  await expect(page.getByRole('link', { name: /^PT Runner/ })).toContainText('Not played yet');
});

test('weekly challenge: off by default; when on, shows on Home, can be marked done and is in the history', async ({ page }) => {
  await page.getByRole('button', { name: 'Try with example data' }).click();
  await page.getByText('Decide for next time').waitFor();
  await expect(page.getByRole('region', { name: 'Weekly challenge' })).toHaveCount(0);
  await tab(page, 'More');
  await expect(page.getByRole('link', { name: /^Weekly challenge/ })).toHaveCount(0);

  await more(page, /^Settings/);
  await page.getByLabel(/^Weekly challenge/).click();
  await tab(page, 'Home');
  const card = page.getByRole('region', { name: 'Weekly challenge' });
  await expect(card.getByRole('heading', { level: 2 })).toHaveText(/this week|record/);
  await card.getByRole('button', { name: /Mark as done/ }).click();
  await expect(card).toContainText('Done');
  await card.getByRole('link', { name: /History/ }).click();
  await expect(page.getByRole('heading', { name: 'Weekly challenge', level: 1 })).toBeVisible();
  await expect(page.locator('.challenge-list li')).toHaveCount(1);
  await expect(page.locator('.challenge-list li')).toContainText('Done');
});
