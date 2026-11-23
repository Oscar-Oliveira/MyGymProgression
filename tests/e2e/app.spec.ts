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

/** The splash (V2-D25) goes by itself when the app is ready. A change of the # part only does not load the page again: no splash. */
async function closeSplash(page: Page) {
  await expect(page.locator('#splash')).toHaveCount(0, { timeout: 5000 });
}

test.beforeEach(async ({ page }) => {
  // All messages must use the in-app dialog; a browser alert/confirm/prompt fails the test.
  nativeDialogs = [];
  page.on('dialog', (d) => void (nativeDialogs.push(d.message()), d.dismiss()));
  await page.goto('/');
  await closeSplash(page);
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
  await page.getByRole('tab', { name: /^Library/ }).click();
  await page.getByRole('searchbox').fill('Barbell Back Squat');
  await expect(page.getByRole('link', { name: /Barbell Back Squat/ }).first().locator('img.thumb')).toHaveAttribute('src', THUMB);
});

test('exercises (V2-D22): the view, search and filters stay after opening an exercise and going back; Mine offers the library', async ({ page }) => {
  await page.getByRole('button', { name: 'Add starter exercises' }).click();
  await more(page, /^Exercises/);
  await expect(page.getByRole('tab', { name: /^Mine/ })).toHaveAttribute('aria-selected', 'true');
  await page.getByRole('searchbox').pressSequentially('Back Squat'); // typed key by key: no letter may be lost
  await expect(page.getByRole('searchbox')).toHaveValue('Back Squat');
  // Starter exercises are not used yet: Mine has none, the library has it.
  await page.getByRole('button', { name: 'Search the library (1)' }).click();
  await expect(page.getByRole('tab', { name: /^Library/ })).toHaveAttribute('aria-selected', 'true');
  await page.getByRole('button', { name: 'Group' }).click();
  await page.getByRole('dialog', { name: 'Group' }).getByRole('radio', { name: /^Legs/ }).click();
  await expect(page.getByRole('button', { name: 'Group: Legs' })).toBeVisible();
  await page.getByRole('link', { name: /Barbell Back Squat/ }).first().click();
  await expect(page.getByRole('heading', { name: 'Barbell Back Squat' })).toBeVisible();
  await page.goBack();
  await expect(page.getByRole('tab', { name: /^Library/ })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('searchbox')).toHaveValue('Back Squat');
  await expect(page.getByRole('button', { name: 'Group: Legs' })).toBeVisible();
  await page.getByRole('button', { name: 'Clear Group' }).click();
  await expect(page.getByRole('button', { name: 'Group', exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: /Barbell Back Squat/ }).first()).toBeVisible();
});

test('back returns to where the page was; a new page starts at the top', async ({ page }) => {
  await page.getByRole('button', { name: 'Add starter exercises' }).click();
  await more(page, /^Exercises/);
  await page.getByRole('tab', { name: /^Library/ }).click();
  await page.getByRole('searchbox').fill('e');
  const last = page.locator('.card a.xitem, .card a').last();
  await last.scrollIntoViewIfNeeded();
  const y = await page.evaluate(() => window.scrollY);
  expect(y).toBeGreaterThan(200);
  await last.click();
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeLessThan(50);
  await page.goBack();
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(y - 50);
});

/** A quick horizontal swipe on the page (touch events, as the app listens to them). */
async function swipe(page: Page, dx: number) {
  await page.locator('main.shell').evaluate((el, d) => {
    const touch = (x: number) => new Touch({ identifier: 1, target: el, clientX: x, clientY: 300 });
    el.dispatchEvent(new TouchEvent('touchstart', { bubbles: true, touches: [touch(150)], changedTouches: [touch(150)] }));
    el.dispatchEvent(new TouchEvent('touchend', { bubbles: true, touches: [], changedTouches: [touch(150 + d)] }));
  }, dx);
}

test('pages below a tab have back: a button and a swipe to the right; without an earlier page it goes up', async ({ page }) => {
  await page.getByRole('button', { name: 'Add starter exercises' }).click();
  await expect(page.locator('.back-btn')).toHaveCount(0); // a main tab
  await more(page, /^Exercises/);
  await page.getByRole('tab', { name: /^Library/ }).click();
  await page.getByRole('searchbox').fill('Squat');
  await page.getByRole('link', { name: /Barbell Back Squat/ }).first().click();
  await page.locator('.back-btn').click();
  await expect(page.getByRole('searchbox')).toHaveValue('Squat');
  await page.getByRole('link', { name: /Barbell Back Squat/ }).first().click();
  await expect(page.getByRole('heading', { name: 'Barbell Back Squat' })).toBeVisible();
  await swipe(page, 120);
  await expect(page.getByRole('searchbox')).toHaveValue('Squat');
  await swipe(page, -120); // to the left: nothing on a page below a tab
  await expect(page.getByRole('searchbox')).toBeVisible();
  // Opened directly (no earlier page in the app): back goes to the page above.
  await page.goto('/#/settings');
  await closeSplash(page);
  await page.reload();
  await closeSplash(page);
  await page.locator('.back-btn').click();
  await expect(page).toHaveURL(/#\/more$/);
});

test('library file: a file that is not a library shows an error', async ({ page }) => {
  await importLibraryFile(page, { hello: 'world' });
  await expect(page.getByText('This file is not an exercise library.')).toBeVisible();
});

test('library file: muscle groups, detail with how-to, video and related exercises', async ({ page }) => {
  await importLibraryFile(page);
  await expect(page.getByText('4 added, 0 updated.')).toBeVisible();
  await more(page, /^Exercises/);
  await page.getByRole('tab', { name: /^Library/ }).click();
  await page.getByRole('button', { name: 'Group' }).click();
  await page.getByRole('dialog', { name: 'Group' }).getByRole('radio', { name: /^Chest/ }).click();
  await page.getByRole('link', { name: /^Bench Press/ }).click();
  await expect(page.getByRole('heading', { name: 'Bench Press', level: 1 })).toBeVisible();
  await expect(page.getByText('Bench Press overview.')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'How to do it' })).toBeVisible();
  await expect(page.getByText('Bench Press step two.')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Watch video' })).toHaveAttribute('href', 'https://www.youtube.com/watch?v=abc123');
  await page.getByRole('link', { name: 'Incline Bench Press' }).click();
  await expect(page.getByRole('heading', { name: 'Incline Bench Press', level: 1 })).toBeVisible();
});

/**
 * v2 navigation (V2-D10): tabs Home · Plan · ▶ · Progress · Exercises; History is inside Progress; More opens from the
 * header of a main page. The old names stay, so the tests read as before.
 */
async function tab(page: Page, name: 'Home' | 'Train' | 'History' | 'More') {
  const nav = page.getByRole('navigation', { name: 'Main' });
  // The More sheet already open: keep it for "More", close it for a tab.
  const sheet = page.getByRole('dialog', { name: 'More' });
  if (await sheet.isVisible()) {
    if (name === 'More') return;
    await page.keyboard.press('Escape');
    await expect(sheet).toHaveCount(0);
  }
  // A form with Cancel + Save hides the tab bar (D69): leave it with Back first.
  if ((await page.locator('.shell .wk-nav').isVisible()) && (await page.locator('.back-btn').isVisible())) await page.locator('.back-btn').click();
  if (name === 'Home') return nav.getByRole('link', { name: 'Home' }).click();
  if (name === 'Train') return nav.getByRole('link', { name: 'Plan' }).click();
  if (name === 'History') {
    await nav.getByRole('link', { name: 'Progress' }).click();
    return page.getByRole('navigation', { name: 'Progress' }).getByRole('link', { name: 'History' }).click();
  }
  // From the current page when it has the button; else from Exercises (a page without trainer messages, which show once a day).
  const moreButton = page.getByRole('button', { name: 'More options' });
  if (!(await moreButton.isVisible())) await nav.getByRole('link', { name: 'Exercises' }).click();
  await moreButton.click();
}
/** Plans are listed in Plan (D77). */
async function plans(page: Page) {
  await tab(page, 'Train');
}
async function more(page: Page, name: RegExp) {
  await tab(page, 'More');
  await page.getByRole('dialog').getByRole('link', { name }).click();
}
/** Opens the ⋯ menu of the page (secondary actions) and picks one. */
async function menu(page: Page, action: string) {
  await page.getByRole('button', { name: /^Options for/ }).first().click();
  await page.getByRole('dialog').getByRole('button', { name: action, exact: true }).click();
}

/** Creates a one-day plan with the given exercises and starts it. New plans default to Hypertrophy. */
async function planAndStart(page: Page, exercises: string[], goal?: 'Strength') {
  await page.getByRole('button', { name: 'Add starter exercises' }).click();
  await plans(page);
  await page.getByRole('button', { name: 'New plan' }).click();
  await page.getByLabel('Plan name').fill('Push');
  if (goal) await page.getByRole('radio', { name: goal }).click();
  await page.getByRole('button', { name: 'Day' }).click();
  for (const name of exercises) {
    await page.getByRole('button', { name: 'Add exercise' }).click();
    await page.getByPlaceholder('Search by name, other name or tag').fill(name);
    await page.getByRole('dialog').getByRole('button', { name: new RegExp(`^${name}`) }).click();
  }
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await page.getByRole('button', { name: /Start this day/ }).click();
}

test('plan goal is saved; a mixed plan sets the type of each day', async ({ page }) => {
  await page.getByRole('button', { name: 'Add starter exercises' }).click();
  await plans(page);
  await page.getByRole('button', { name: 'New plan' }).click();
  await page.getByLabel('Plan name').fill('Mix');
  const planGoal = page.getByRole('radiogroup', { name: 'Goal' });
  await planGoal.getByRole('radio', { name: 'Mixed' }).click();
  await page.getByRole('button', { name: 'Day' }).click();
  const dayGoal = page.getByRole('radiogroup', { name: 'Type of this day' });
  await expect(dayGoal.getByRole('radio', { name: 'Free' })).toHaveAttribute('aria-checked', 'true');
  await dayGoal.getByRole('radio', { name: 'Strength' }).click();
  await page.getByRole('button', { name: 'Add exercise' }).click();
  await page.getByPlaceholder('Search by name, other name or tag').fill('Machine Chest Press');
  await page.getByRole('dialog').getByRole('button', { name: /^Machine Chest Press/ }).click();
  // A strength day gives the strength default sets (5×5) and the automatic load rule.
  await expect(page.getByLabel('Machine Chest Press Sets')).toHaveValue('5');
  await expect(page.getByText('Load goes up automatically').first()).toBeVisible();
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.locator('.toast')).toHaveText('Saved');
  await expect(page.getByRole('button', { name: 'Save', exact: true })).toBeDisabled();

  await page.reload();
  await closeSplash(page);
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
  await plans(page);
  await page.getByRole('button', { name: 'New plan' }).click();
  await page.getByLabel('Plan name').fill('Circ');
  await page.getByRole('button', { name: 'Day' }).click();
  await page.getByRole('button', { name: 'Circuit' }).click();
  const block = page.getByRole('region', { name: 'Circuit 1' });
  await block.getByLabel('Circuit 1 Rounds').fill('2');
  for (const name of ['Push-up', 'Plank']) {
    await block.getByRole('button', { name: 'Exercise in circuit' }).click();
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
  await circuit.getByRole('button', { name: 'Circuit done' }).click();
  await expect(page.getByText('4/4 sets')).toBeVisible();
  // A circuit marked done by mistake can be undone.
  await circuit.getByRole('button', { name: 'Circuit done — undo' }).click();
  await expect(page.getByText('0/4 sets')).toBeVisible();
  await circuit.getByRole('button', { name: 'Circuit done' }).click();
  await expect(page.getByText('4/4 sets')).toBeVisible();
  await page.getByRole('button', { name: 'Finish workout' }).click();
  await expect(page.getByRole('heading', { name: 'Next time' })).toBeVisible();
});

test('join a duplicate exercise: the plan uses the kept one and the old name still finds it', async ({ page }) => {
  await page.getByRole('button', { name: 'Add starter exercises' }).click();
  await plans(page);
  await page.getByRole('button', { name: 'New plan' }).click();
  await page.getByLabel('Plan name').fill('Push');
  await page.getByRole('button', { name: 'Day' }).click();
  await page.getByRole('button', { name: 'Add exercise' }).click();
  await page.getByPlaceholder('Search by name, other name or tag').fill('Machine Chest Press');
  await page.getByRole('dialog').getByRole('button', { name: /^Machine Chest Press/ }).click();
  await page.getByRole('button', { name: 'Save', exact: true }).click();

  await more(page, /^Exercises/);
  await page.getByRole('tab', { name: /^Library/ }).click();
  await page.getByRole('searchbox').fill('Barbell Bench Press');
  await page.getByRole('link', { name: /^Barbell Bench Press/ }).first().click();
  await menu(page, 'Join a duplicate');
  await page.getByPlaceholder('Search by name, other name or tag').fill('Machine Chest Press');
  await page.getByRole('dialog').getByRole('button', { name: /^Machine Chest Press/ }).click();
  const confirm = page.getByRole('dialog', { name: 'Confirm' });
  await expect(confirm).toContainText('1 plans, 0 workouts');
  await confirm.getByRole('button', { name: 'Join', exact: true }).click();
  await expect(page.locator('.toast')).toContainText('was joined into');
  await expect(page.locator('.page-head small')).toContainText('Machine Chest Press'); // now another name

  await plans(page);
  await page.getByRole('link', { name: /^Push/ }).click();
  await expect(page.getByRole('link', { name: /^Barbell Bench Press/ })).toBeVisible();
  // Now in a plan, the kept exercise is one of mine (V2-D22).
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
  const enable = page.getByLabel(/^Personal trainer/);
  await enable.click();
  await expect(enable).toBeChecked();
  await more(page, /^Personal trainer/);
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
  await page.getByLabel(/^Personal trainer/).click();
  await more(page, /^Personal trainer/);
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
  await more(page, /^Personal trainer/);
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
  await plans(page);
  await page.getByRole('link', { name: /^Demo/ }).click();
  await page.getByRole('link', { name: 'Edit', exact: true }).click();
  await page.getByRole('radiogroup', { name: 'Plan colour' }).getByRole('radio', { name: 'Teal' }).click();
  await page.getByRole('radiogroup', { name: 'Goal' }).getByRole('radio', { name: 'Strength' }).click();
  await expect(page.getByRole('radiogroup', { name: 'Strength mode' })).toHaveCount(0);
  const confirm = page.getByRole('dialog', { name: 'Confirm' });
  await expect(confirm).toContainText('5×5');
  await confirm.getByRole('button', { name: 'Cancel' }).click();
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await tab(page, 'Home');
  // The Home card: Train, left just before, also has Start buttons (D77).
  await page.locator('.hero').getByRole('button', { name: /Start workout/ }).click();
  await expect(page.getByRole('button', { name: 'Set done' })).toHaveCSS('background-color', 'rgb(15, 118, 110)');
});

test('personal trainer "after every exercise": a message appears when an exercise is done', async ({ page }) => {
  await page.getByRole('button', { name: 'Try with example data' }).click();
  await page.getByText('Decide for next time').waitFor();
  await more(page, /^Settings/);
  const enable = page.getByLabel(/^Personal trainer/);
  await enable.click();
  await expect(enable).toBeChecked();
  await more(page, /^Personal trainer/);
  await page.getByRole('combobox', { name: 'When' }).selectOption({ label: 'After every exercise' });
  await tab(page, 'Home');
  await page.getByRole('button', { name: /Start workout/ }).click();
  await expect(page.getByRole('status', { name: 'Personal trainer' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Set done' }).click(); // the warm-up has one set
  await expect(page.getByRole('status', { name: 'Personal trainer' }).locator('.coach-avatar')).toBeVisible();
});

test('analysis: period dates and workouts per week; a week lists its workouts', async ({ page }) => {
  await page.getByRole('button', { name: 'Try with example data' }).click();
  await page.getByText('Decide for next time').waitFor();
  await more(page, /^Reports/);
  await expect(page.getByRole('heading', { name: 'Workouts per week' })).toBeVisible();
  await expect(page.locator('.period-range')).toContainText('–');
  await page.getByRole('button', { name: /^Week of .*: 2 workouts$/ }).first().click();
  await expect(page.locator('.week-list a')).toHaveCount(2);
  await page.getByRole('radio', { name: '4 wks' }).click();
  await expect(page.getByRole('button', { name: /^Week of / })).toHaveCount(4); // this week and the 3 before, any day
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
  await expect(page.getByRole('button', { name: 'Set done' })).toBeVisible();
});

async function logChest(page: Page, reps: number[]) {
  const chest = page.getByRole('region', { name: 'Machine Chest Press' });
  for (const r of reps) {
    await chest.getByLabel('Reps', { exact: true }).fill(String(r));
    await chest.getByRole('button', { name: 'Set done' }).click();
  }
}

test('hypertrophy: top of the range → choose reps up → next workout 9–13 at the same load', async ({ page }) => {
  await planAndStart(page, ['Treadmill Warm-up', 'Machine Chest Press']);
  await expect(page.getByRole('heading', { name: 'Treadmill Warm-up' })).toBeVisible();
  await page.getByRole('button', { name: 'Set done' }).click();
  await page.getByRole('button', { name: 'Next' }).click();

  await expect(page.getByText('Do 12 reps in every set → then choose: load 22.5 kg or reps 9–13.')).toBeVisible();
  await logChest(page, [12, 12, 12]);
  await page.getByRole('button', { name: 'Finish workout' }).click();

  await expect(page.getByRole('region', { name: 'Treadmill Warm-up' }).getByText('Done as planned', { exact: true })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Machine Chest Press' }).getByText('Ready to progress — load or reps?', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Reps 9–13' }).click();
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
  await page.getByRole('button', { name: 'Finish workout' }).click();
  await page.getByRole('button', { name: 'Load 22.5 kg' }).click();
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
  for (let i = 0; i < 5; i++) await chest.getByRole('button', { name: 'Set done' }).click();
  await page.getByRole('button', { name: 'Finish workout' }).click();
  await expect(page.getByRole('region', { name: 'Machine Chest Press' }).getByText('Up to 22.5 kg', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(page.getByRole('region', { name: 'Machine Chest Press' }).getByText('Kept at 20 kg (increase undone)', { exact: true })).toBeVisible();
});

test('quick view: all sets on one screen; a new load goes to the next sets; long press skips; the normal view shows the same sets', async ({ page }) => {
  await planAndStart(page, ['Machine Chest Press']);
  await page.getByRole('button', { name: 'Quick view' }).click();
  const quick = page.getByRole('region', { name: 'Quick view' });
  await quick.getByRole('button', { name: /^Change Set 2:/ }).click();
  await quick.getByLabel('Load', { exact: true }).fill('17.5');
  await quick.getByRole('button', { name: 'OK' }).click();
  await expect(quick.getByRole('button', { name: /^Change Set 1:.* 20 kg$/ })).toBeVisible();
  await expect(quick.getByRole('button', { name: /^Change Set 2:.* 17\.5 kg$/ })).toBeVisible();
  await expect(quick.getByRole('button', { name: /^Change Set 3:.* 17\.5 kg$/ })).toBeVisible();
  await quick.getByRole('button', { name: 'Set 1 done' }).click();
  await expect(quick.getByRole('button', { name: 'Set 1 done' })).toHaveAttribute('aria-pressed', 'true');
  await quick.getByRole('button', { name: 'Set 3 done' }).click({ delay: 800 });
  await expect(quick.getByRole('button', { name: 'Change Set 3: Skipped' })).toBeVisible();
  await expect(page.getByText('1/3 sets')).toBeVisible();
  // Back to the normal view: the same workout, set 2 open with the new load.
  await page.getByRole('button', { name: 'Quick view' }).click();
  const chest = page.getByRole('region', { name: 'Machine Chest Press' });
  await expect(chest.getByRole('button', { name: 'Set 3: Skipped' })).toBeVisible();
  await expect(chest.getByLabel('Load', { exact: true })).toHaveValue('17.5');
  // A new workout opens in the normal view.
  await chest.getByRole('button', { name: 'Set done' }).click();
  await page.getByRole('button', { name: 'Finish workout' }).click();
  await expect(page.getByRole('button', { name: 'Quick view' })).toHaveCount(0);
});

test('missed reps → asks keep or step back → step back lowers the load', async ({ page }) => {
  await planAndStart(page, ['Machine Chest Press']);
  await logChest(page, [9, 7, 6]);
  await page.getByRole('button', { name: 'Finish workout' }).click();
  await expect(page.getByRole('region', { name: 'Machine Chest Press' }).getByText('Missed reps — keep or step back?', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Keep 20 kg' })).toBeVisible();
  await page.getByRole('button', { name: 'Down to 17.5 kg' }).click();
  await expect(page.getByRole('region', { name: 'Machine Chest Press' }).getByText('Down to 17.5 kg', { exact: true })).toBeVisible();
});

test('within the range with skipped set → keeps the load without asking', async ({ page }) => {
  await planAndStart(page, ['Machine Chest Press']);
  await logChest(page, [10, 9]);
  await page.getByRole('button', { name: 'Skip set' }).click();
  await page.getByRole('button', { name: 'Finish workout' }).click();
  await expect(page.getByRole('region', { name: 'Machine Chest Press' }).getByText('Keep 20 kg', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: /Down to/ })).toHaveCount(0);
});

test('custom exercise with duration measurement', async ({ page }) => {
  await more(page, /^Exercises/);
  await page.getByRole('link', { name: 'New exercise' }).click();
  await page.getByLabel('Name', { exact: true }).fill('Wall sit');
  await page.getByLabel('Measurement type').selectOption('duration');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Wall sit' })).toBeVisible();
  await expect(page.getByText('Duration progression')).toBeVisible();
});

test('demo data → analysis → export → delete all → import restores data', async ({ page }) => {
  await page.getByRole('button', { name: 'Try with example data' }).click();
  await expect(page.getByText('Decide for next time')).toBeVisible();

  await more(page, /^Reports/);
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
  await page.getByRole('button', { name: 'Next' }).click();
  await expect(page.locator('a.hist-row')).toHaveCount(2);
  await expect(page.getByRole('button', { name: 'Next' })).toBeDisabled();
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
  await closeSplash(page);
  await page.getByRole('button', { name: 'Try with example data' }).click();
  await plans(page);
  const name = (await page.locator('.plan-card h2').first().innerText()).trim();
  await page.getByRole('button', { name: `Options for ${name}` }).click();
  await page.getByRole('button', { name: 'Share', exact: true }).click();
  await page.getByRole('button', { name: /Share link/ }).click();
  await expect.poll(() => page.evaluate(() => (window as unknown as { shared?: string }).shared)).toContain('#/share?d=');
  const link = await page.evaluate(() => (window as unknown as { shared: string }).shared);
  await page.goto(link);
  await closeSplash(page);
  await expect(page.getByText('Shared plan')).toBeVisible();
  await expect(page.getByRole('heading', { name })).toBeVisible();
  await expect(page.getByText(/0 new exercises for the library/)).toBeVisible();
  await page.getByRole('button', { name: /Import plan/ }).click();
  await expect(page).toHaveURL(/#\/plans\//);
  await expect(page.getByLabel('Plan name')).toBeVisible();
  await plans(page);
  await expect(page.locator('.plan-card h2', { hasText: name })).toHaveCount(2);
});

test('share a plan by QR: one code per day; days read in any order join into one plan', async ({ page }) => {
  await page.getByRole('button', { name: 'Try with example data' }).click();
  await plans(page);
  const name = (await page.locator('.plan-card h2').first().innerText()).trim();
  await page.getByRole('button', { name: `Options for ${name}` }).click();
  await page.getByRole('button', { name: 'Share', exact: true }).click();
  await page.getByRole('button', { name: /QR per day/ }).click();
  // The codes as images, as a screenshot sent to the other person.
  await expect(page.getByText(/^Day 1 of 2 · /)).toBeVisible();
  const day1 = await page.locator('svg.qr').screenshot();
  await page.getByRole('button', { name: 'Next' }).click();
  await expect(page.getByText(/^Day 2 of 2 · /)).toBeVisible();
  const day2 = await page.locator('svg.qr').screenshot();
  await page.getByRole('button', { name: 'Close' }).click();

  await page.getByRole('link', { name: /Scan QR/ }).click();
  const image = page.getByLabel('Read from an image');
  await image.setInputFiles({ name: 'day2.png', mimeType: 'image/png', buffer: day2 });
  await expect(page.getByText('Day 1: not read yet')).toBeVisible();
  await expect(page.getByRole('button', { name: 'View and import (1 day)' })).toBeVisible();
  await image.setInputFiles({ name: 'day1.png', mimeType: 'image/png', buffer: day1 });
  await page.getByRole('button', { name: 'View and import (2 days)' }).click();
  await expect(page.getByRole('heading', { name })).toBeVisible();
  await expect(page.locator('section.card h3')).toHaveCount(2);
  await expect(page.getByText(/0 new exercises for the library/)).toBeVisible();
  await page.getByRole('button', { name: /Import plan/ }).click();
  await expect(page).toHaveURL(/#\/plans\//);
  await expect(page.getByLabel('Plan name')).toBeVisible();
  await plans(page);
  await expect(page.locator('.plan-card h2', { hasText: name })).toHaveCount(2);
});

test('a damaged share link shows an error', async ({ page }) => {
  await page.goto('/#/share?d=broken');
  await closeSplash(page);
  await expect(page.getByText('This link is not valid or is incomplete.')).toBeVisible();
});

test('v2 library: installs from the app; images come from the source, with the attribution in Exercises', async ({ page }) => {
  // The media is served by jsDelivr (V2-D12); here a tiny local image stands in, so the test does not need the network.
  const tiny = Buffer.from('R0lGODlhAQABAIAAAP///wAAACH5BAEAAAAALAAAAAABAAEAAAICRAEAOw==', 'base64');
  await page.route('https://cdn.jsdelivr.net/**', (r) => r.fulfill({ contentType: 'image/gif', body: tiny, headers: { 'access-control-allow-origin': '*' } }));
  await more(page, /^Settings/);
  await page.getByRole('button', { name: /Install exercise library/ }).click();
  await expect(page.getByText(/^1324 added, 0 updated\.$/)).toBeVisible({ timeout: 30000 });
  await more(page, /^Exercises/);
  await page.getByRole('tab', { name: /^Library/ }).click();
  await page.getByRole('searchbox').fill('Barbell Full Squat');
  const thumb = page.getByRole('link', { name: /^Barbell Full Squat/ }).first().locator('img.thumb');
  await expect(thumb).toHaveAttribute('src', /^https:\/\/cdn\.jsdelivr\.net\/gh\/hasaneyldrm\/exercises-dataset@/);
  await expect(thumb).toHaveAttribute('crossorigin', 'anonymous');
  await expect(page.getByText(/Gym visual/)).toBeVisible();
});

test('analysis: weekly sets per muscle with the guideline, and comparison with the previous period', async ({ page }) => {
  await page.getByRole('button', { name: 'Try with example data' }).click();
  await page.getByText('Decide for next time').waitFor();
  await more(page, /^Reports/);
  await expect(page.getByRole('heading', { name: 'Sets per muscle per week' })).toBeVisible();
  await expect(page.locator('.mbar .guide').first()).toBeVisible();
  // 4 weeks: the demo has 6 weeks, so the 4 weeks before have workouts to compare with.
  await page.getByRole('radio', { name: '4 wks' }).click();
  await expect(page.getByText(/^Compared with /)).toBeVisible();
});

test('pause: the workout stays open; History resumes it', async ({ page }) => {
  await planAndStart(page, ['Machine Chest Press']);
  await logChest(page, [10]);
  await page.getByRole('link', { name: /Pause/ }).click();
  await expect(page.getByText('Workout in progress')).toBeVisible();
  await tab(page, 'History');
  const banner = page.locator('.card.warn', { hasText: 'Paused' });
  await banner.getByRole('button', { name: /Resume workout/ }).click();
  await expect(page.getByRole('button', { name: 'Set done' })).toBeVisible();
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
  await expect(page.getByRole('button', { name: 'Set done' })).toBeVisible();
});

test('correction: not-done sets stand out, and the status can be changed', async ({ page }) => {
  await planAndStart(page, ['Machine Chest Press']);
  await logChest(page, [10]);
  await page.getByRole('button', { name: 'Finish workout' }).click();
  await page.getByRole('dialog', { name: 'Confirm' }).getByRole('button', { name: 'OK' }).click();
  await expect(page.getByText('Partially completed')).toBeVisible();
  await menu(page, 'Correct records');
  await expect(page.getByText('2 sets not done')).toBeVisible();
  await page.getByLabel('Status').selectOption('completed');
  await page.getByRole('button', { name: 'Save correction' }).click();
  await expect(page.getByText(/· Completed$/)).toBeVisible();
});

test('correction: an increase the corrected sets no longer support is undone only when the user agrees', async ({ page }) => {
  await planAndStart(page, ['Machine Chest Press'], 'Strength');
  await logChest(page, [5, 5, 5, 5, 5]);
  await page.getByRole('button', { name: 'Finish workout' }).click();
  const chest = page.getByRole('region', { name: 'Machine Chest Press' });
  await expect(chest.getByText(/^Up to /)).toBeVisible();
  await menu(page, 'Correct records');
  await page.getByRole('region', { name: 'Machine Chest Press' }).getByLabel('Reps 1', { exact: true }).fill('3');
  await page.getByRole('button', { name: 'Save correction' }).click();
  const ask = page.getByRole('dialog', { name: 'Confirm' });
  await expect(ask).toContainText('no longer reached the top of the range');
  await ask.getByRole('button', { name: 'Undo increase' }).click();
  await expect(chest.getByText(/increase undone/)).toBeVisible();
});

test('correction: "Use the current plan" updates the exercises from the plan, then saving works', async ({ page }) => {
  await planAndStart(page, ['Machine Chest Press']);
  await logChest(page, [10, 10, 10]);
  await page.getByRole('button', { name: 'Finish workout' }).click();
  await menu(page, 'Correct records');
  await page.getByRole('button', { name: 'Use the current plan' }).click();
  await expect(page.getByText('1 exercise updated from the current plan.')).toBeVisible();
  await page.getByRole('button', { name: 'Save correction' }).click();
  await expect(page.getByRole('button', { name: 'Use the current plan' })).toHaveCount(0);
});

test('exercise editor: leaving with unsaved changes asks first; saving does not ask', async ({ page }) => {
  await more(page, /^Exercises/);
  await page.getByRole('link', { name: 'New exercise' }).click();
  await page.getByLabel('Name', { exact: true }).fill('Cable fly');
  await expect(page.getByRole('navigation', { name: 'Main' })).toBeHidden();
  await page.locator('.back-btn').click();
  const ask = page.getByRole('dialog', { name: 'Confirm' });
  await expect(ask).toContainText('unsaved changes');
  await ask.getByRole('button', { name: 'Cancel' }).click();
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Cable fly' })).toBeVisible();
  await expect(ask).toHaveCount(0);
});

test('correction: leaving with unsaved changes asks first', async ({ page }) => {
  await planAndStart(page, ['Machine Chest Press']);
  await logChest(page, [10, 10, 10]);
  await page.getByRole('button', { name: 'Finish workout' }).click();
  await menu(page, 'Correct records');
  await page.getByRole('region', { name: 'Machine Chest Press' }).getByLabel('Reps 1', { exact: true }).fill('8');
  await page.locator('.back-btn').click();
  const ask = page.getByRole('dialog', { name: 'Confirm' });
  await expect(ask).toContainText('unsaved changes');
  await ask.getByRole('button', { name: 'Leave' }).click();
  await expect(page.getByRole('region', { name: 'Machine Chest Press' }).getByLabel('Reps 1', { exact: true })).toHaveCount(0);
});

test('plan editor: leaving with unsaved changes asks first', async ({ page }) => {
  await plans(page);
  await page.getByRole('button', { name: 'New plan' }).click();
  await page.getByLabel('Plan name').fill('Unsaved');
  await page.locator('.back-btn').click();
  const ask = page.getByRole('dialog', { name: 'Confirm' });
  await expect(ask).toContainText('unsaved changes');
  await ask.getByRole('button', { name: 'Cancel' }).click();
  await expect(page.getByLabel('Plan name')).toHaveValue('Unsaved');
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await ask.getByRole('button', { name: 'Leave' }).click();
  await expect(page.getByLabel('Plan name')).toHaveCount(0);
});

test('exercise page: add the exercise to a plan day; a day that has it is marked', async ({ page }) => {
  await page.getByRole('button', { name: 'Add starter exercises' }).click();
  await plans(page);
  await page.getByRole('button', { name: 'New plan' }).click();
  await page.getByLabel('Plan name').fill('Push');
  await page.getByRole('button', { name: 'Day' }).click();
  await page.getByRole('button', { name: 'Add exercise' }).click();
  await page.getByPlaceholder('Search by name, other name or tag').fill('Machine Chest Press');
  await page.getByRole('dialog').getByRole('button', { name: /^Machine Chest Press/ }).click();
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await more(page, /^Exercises/);
  // In a plan, so in Mine (V2-D22).
  await page.getByPlaceholder('Search by name, other name or tag').fill('Machine Chest Press');
  await page.getByRole('link', { name: /Machine Chest Press/ }).first().click();
  await menu(page, 'Add to plan');
  const sheet = page.getByRole('dialog', { name: 'Add to plan' });
  await expect(sheet.getByRole('button', { name: /already there/ })).toBeDisabled();
  await page.goBack();
  await page.getByRole('tab', { name: /^Library/ }).click();
  await page.getByPlaceholder('Search by name, other name or tag').fill('Lat Pulldown');
  await page.getByRole('link', { name: /Lat Pulldown/ }).first().click();
  await menu(page, 'Add to plan');
  await sheet.getByRole('button', { name: /1 exercise/ }).click();
  await expect(page.locator('.toast')).toContainText('Added to');
  await plans(page);
  await page.getByText('Push').first().click();
  await expect(page.getByText('Lat Pulldown').first()).toBeVisible();
  expect(nativeDialogs).toEqual([]);
});

test('games: each game opens and plays; scores are saved and can be reset', async ({ page }) => {
  await page.getByRole('button', { name: 'Add starter exercises' }).click();
  await more(page, /^Games/);
  for (const name of ['Trainer memory', 'Whack-a-PT', 'Guess the muscle', 'Flappy Dumbbell', 'PT Runner', 'Starship', 'Leg Day Escape']) await expect(page.getByRole('link', { name: new RegExp(`^${name}`) })).toBeVisible();
  // The secret game is listed only after the easter egg.
  await expect(page.getByRole('link', { name: /^Rerack!/ })).toHaveCount(0);

  // Without input the sergeant catches you, the squats are not done in time: the score is saved.
  await page.getByRole('link', { name: /^Leg Day Escape/ }).click();
  await page.getByRole('button', { name: /Play/ }).click();
  await expect(page.getByLabel('Leg Day Escape')).toBeVisible();
  await expect(page.getByRole('button', { name: /Squat/ })).toBeVisible({ timeout: 20_000 });
  await expect(page.getByRole('button', { name: /Play again/ })).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText(/^Best: \d+ points$/)).toBeVisible();
  await page.locator('.back-btn').click();

  await page.getByRole('link', { name: /^Trainer memory/ }).click();
  await page.getByRole('button', { name: /Play/ }).click();
  await expect(page.getByRole('button', { name: /^Card \d+$/ })).toHaveCount(20);
  await page.locator('.back-btn').click();

  await page.getByRole('link', { name: /^Whack-a-PT/ }).click();
  await page.getByRole('button', { name: /Play/ }).click();
  await expect(page.locator('.whack-hole')).toHaveCount(9);
  await page.locator('.back-btn').click();

  await page.getByRole('link', { name: /^Guess the muscle/ }).click();
  await page.getByRole('button', { name: /Play/ }).click();
  await expect(page.locator('.muscle-options button')).toHaveCount(4);
  await page.locator('.back-btn').click();

  // Without input the runner hits the first obstacle: the score is saved.
  await page.getByRole('link', { name: /^PT Runner/ }).click();
  await page.getByRole('button', { name: /Play/ }).click();
  await expect(page.getByLabel('PT Runner')).toBeVisible();
  await expect(page.getByRole('button', { name: /Play again/ })).toBeVisible({ timeout: 15_000 });
  await expect(page.locator('.game-page').getByRole('status')).toContainText(' m');
  await expect(page.getByText(/^Best: \d+ m$/)).toBeVisible();

  await page.locator('.back-btn').click();
  await page.getByRole('link', { name: /^Flappy Dumbbell/ }).click();
  await page.getByRole('button', { name: /Play/ }).click();
  await page.getByLabel('Flappy Dumbbell').click();
  await expect(page.getByRole('button', { name: /Play again/ })).toBeVisible({ timeout: 15_000 });

  await page.locator('.back-btn').click();
  await page.getByRole('link', { name: /^Starship/ }).click();
  await page.getByRole('button', { name: /Play/ }).click();
  await expect(page.getByLabel('Starship')).toBeVisible();

  await page.locator('.back-btn').click();
  await expect(page.getByRole('link', { name: /^PT Runner/ })).toContainText('Best:');
  await menu(page, 'Delete all scores');
  await page.getByRole('dialog', { name: 'Confirm' }).getByRole('button', { name: 'Delete all scores' }).click();
  await expect(page.getByRole('link', { name: /^PT Runner/ })).toContainText('Not played yet');
});

test('weekly challenge: off by default; turned on in Settings, shows on Home, can be marked done, is in the history and can be closed', async ({ page }) => {
  await page.getByRole('button', { name: 'Try with example data' }).click();
  await page.getByText('Decide for next time').waitFor();
  await expect(page.getByRole('region', { name: 'Weekly challenge' })).toHaveCount(0);

  // Off: not listed in More (D78); turned on in Settings.
  await tab(page, 'More');
  await expect(page.getByRole('link', { name: /^Weekly challenge/ })).toHaveCount(0);
  await more(page, /^Settings/);
  await page.getByLabel(/^Weekly challenge/).click();
  await tab(page, 'Home');
  const card = page.getByRole('region', { name: 'Weekly challenge' });
  await expect(card.getByRole('heading', { level: 2 })).toHaveText(/this week|record/);
  await card.getByRole('button', { name: /Mark as done/ }).click();
  await expect(card).toContainText('Done');
  await expect(card.getByRole('link')).toHaveCount(0);
  await more(page, /^Weekly challenge/);
  await expect(page.getByRole('heading', { name: 'Weekly challenge', level: 1 })).toBeVisible();
  await expect(page.locator('.challenge-list li')).toHaveCount(1);
  await expect(page.locator('.challenge-list li')).toContainText('Done');
  await tab(page, 'Home');
  await card.getByRole('button', { name: 'Close' }).click();
  await expect(card).toHaveCount(0);
  await page.reload();
  await closeSplash(page);
  await expect(page.getByRole('region', { name: 'Weekly challenge' })).toHaveCount(0);
});

test('loads across plans: hypertrophy load up → asks to update the strength plan → strength uses the new load', async ({ page }) => {
  await page.getByRole('button', { name: 'Add starter exercises' }).click();
  for (const [name, goal] of [['Heavy', 'Strength'], ['Pump', 'Hypertrophy']]) {
    await plans(page);
    await page.getByRole('button', { name: 'New plan' }).click();
    await page.getByLabel('Plan name').fill(name);
    await page.getByRole('radio', { name: goal }).click();
    await page.getByRole('button', { name: 'Day' }).click();
    await page.getByRole('button', { name: 'Add exercise' }).click();
    await page.getByPlaceholder('Search by name, other name or tag').fill('Machine Chest Press');
    await page.getByRole('dialog').getByRole('button', { name: /^Machine Chest Press/ }).click();
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.getByText('Saved')).toBeVisible();
  }
  await page.getByRole('button', { name: /Start this day/ }).click();
  await logChest(page, [12, 12, 12]);
  await page.getByRole('button', { name: 'Finish workout' }).click();
  await page.getByRole('button', { name: 'Load 22.5 kg' }).click();
  // 20 kg × 12 → 1RM 28 kg → 5 reps 24 kg → 22.5 kg.
  await expect(page.getByRole('heading', { name: 'Loads across plans' })).toBeVisible();
  await expect(page.getByText('Update 20 kg → 22.5 kg?')).toBeVisible();
  await expect(page.getByText('Hypertrophy in Pump — Day A went up to 22.5 kg.')).toBeVisible();
  await page.getByRole('button', { name: 'Update to 22.5 kg' }).click();
  await expect(page.getByText('Set to 22.5 kg')).toBeVisible();
  await plans(page);
  // The plan card starts its next day (V2-D24).
  await page.getByRole('article', { name: 'Heavy' }).getByRole('button', { name: /^Start/ }).click();
  await expect(page.getByRole('region', { name: 'Machine Chest Press' }).getByLabel('Load', { exact: true })).toHaveValue('22.5');
});

test('personal trainer page: own menu entry; extras off by default; reports are not there', async ({ page }) => {
  // Off: not listed in More (D78).
  await tab(page, 'More');
  await expect(page.getByRole('link', { name: /^Personal trainer/ })).toHaveCount(0);
  await more(page, /^Settings/);
  await page.getByLabel(/^Personal trainer/).click();
  await more(page, /^Personal trainer/);
  await expect(page.getByRole('heading', { name: 'Personal trainer', level: 1 })).toBeVisible();
  await expect(page.getByLabel(/Reaction when you beat last time/)).not.toBeChecked();
  // Technique tips no longer need the trainer (D75).
  await expect(page.getByLabel(/Technique tips/)).toHaveCount(0);
  await expect(page.getByLabel(/You vs 3 months ago|Week report/)).toHaveCount(0);
});

test('workout: short on time, do it later and the setup note', async ({ page }) => {
  await planAndStart(page, ['Machine Chest Press', 'Barbell Back Squat', 'Push-up']);
  const selected = page.getByRole('tablist').getByRole('tab', { selected: true });
  await expect(selected).toHaveAccessibleName('Machine Chest Press');
  await page.getByRole('button', { name: 'Workout options' }).click();
  await page.getByRole('button', { name: 'Do it later' }).click();
  await expect(selected).toHaveAccessibleName('Barbell Back Squat');
  await expect(page.getByRole('tablist').getByRole('tab').last()).toHaveAccessibleName('Machine Chest Press');

  await page.getByRole('button', { name: 'Short on time' }).click();
  await page.getByRole('dialog', { name: 'Confirm' }).getByRole('button', { name: 'Shorten' }).click();
  await expect(page.getByRole('button', { name: 'Short on time' })).toHaveCount(0);
  await expect(page.getByText('Short on time: one set less, no increase this time.')).toBeVisible();

  await page.getByRole('button', { name: 'Setup', exact: true }).click();
  await page.getByRole('textbox', { name: 'Setup' }).fill('Safety bars on 5');
  await page.getByRole('button', { name: 'Set done' }).focus();
  await expect(page.getByRole('button', { name: 'Setup: Safety bars on 5' })).toBeVisible();
});

test('automatic warm-up: warm-up sets before the first compound exercise when on', async ({ page }) => {
  await more(page, /^Settings/);
  await page.getByLabel(/Automatic warm-up/).click();
  await tab(page, 'Home');
  await planAndStart(page, ['Machine Chest Press']);
  await expect(page.getByRole('group', { name: 'Set W' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Machine Chest Press' }).getByLabel('Load', { exact: true })).toHaveValue('10');
});

test('analysis: consistency map and a goal with its status; the goal also shows on the exercise page', async ({ page }) => {
  await page.getByRole('button', { name: 'Try with example data' }).click();
  await page.getByText('Decide for next time').waitFor();
  await more(page, /^Reports/);
  await expect(page.getByRole('heading', { name: 'Consistency' })).toBeVisible();
  await expect(page.getByText('Weeks in a row')).toBeVisible();
  const goals = page.getByRole('region', { name: 'Goals' });
  await goals.getByRole('button', { name: 'New goal' }).click();
  await goals.getByLabel('Exercise').selectOption({ label: 'Romanian Deadlift' });
  await goals.getByRole('textbox', { name: 'Load (kg)' }).fill('200');
  await goals.getByRole('button', { name: 'Add' }).click();
  await expect(goals.getByText('Romanian Deadlift · 200 kg')).toBeVisible();
  await expect(goals.getByText(/At this pace|No upward trend|A projection needs/)).toBeVisible();
  await page.getByRole('link', { name: /^Romanian Deadlift/ }).first().click();
  await expect(page.getByRole('region', { name: 'Goals' }).getByText('200 kg')).toBeVisible();
});

test('reports without the trainer: tabs, the Sunday report on Home, the rival on the summary and the share image', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-11-01T18:00:00'));
  await page.getByRole('button', { name: 'Try with example data' }).click();
  await page.getByText('Decide for next time').waitFor();
  await more(page, /^Reports/);
  await expect(page.getByRole('heading', { name: 'Progress', level: 1 })).toBeVisible();
  // Off: they are not in the Reports card (D78, V2-D23).
  const reports = page.getByRole('region', { name: 'Reports' });
  await expect(reports.getByRole('link', { name: /^Year in review/ })).toBeVisible();
  await expect(reports.getByRole('link', { name: /^Week report/ })).toHaveCount(0);
  await expect(reports.getByRole('link', { name: /^You vs 3 months ago/ })).toHaveCount(0);
  await more(page, /^Settings/);
  await page.getByLabel(/^Week report/).click();
  await page.getByLabel(/^You vs 3 months ago/).click();
  await more(page, /^Reports/);
  await reports.getByRole('link', { name: /^Week report/ }).click();
  await expect(page.getByRole('heading', { name: 'Week report', level: 1 })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Week report' })).toBeVisible();
  await page.locator('.back-btn').click();
  await reports.getByRole('link', { name: /^You vs 3 months ago/ }).click();
  await expect(page.getByRole('region', { name: 'You vs your past self' })).toBeVisible();
  await tab(page, 'Home');
  const report = page.getByRole('region', { name: 'Week report' });
  await expect(report).toBeVisible();
  await report.getByRole('button', { name: 'Close' }).click();
  await expect(report).toHaveCount(0);

  await tab(page, 'History');
  await page.locator('a.hist-row').first().click();
  // The latest workout of the demo: the same plan day 4+ weeks before is its rival.
  await expect(page.getByRole('region', { name: 'You vs your past self' })).toBeVisible();
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Share image' }).click();
  expect((await download).suggestedFilename()).toMatch(/^mygymprogression-\d{4}-\d{2}-\d{2}\.png$/);
});

test('splash (V2-D25): logo, name and version; it goes by itself; the gym name shows on the next start', async ({ page }) => {
  await more(page, /^Settings/);
  await page.getByLabel('Gym', { exact: true }).fill('City Gym');
  await page.getByLabel('Gym', { exact: true }).blur();
  await page.goto('/', { waitUntil: 'commit' });
  const splash = page.locator('#splash');
  await expect(splash.getByText('MyGymProgression')).toBeVisible();
  await expect(splash.getByText('@ City Gym')).toBeVisible();
  await expect(splash.getByText(/^v\d+\.\d+\.\d+$/)).toBeVisible();
  await expect(splash).toHaveCount(0, { timeout: 5000 });
});

test('games: one back button; sound and vibration can be turned off in Settings', async ({ page }) => {
  await more(page, /^Settings/);
  const sound = page.getByLabel('Game sound');
  await expect(sound).toBeChecked();
  await sound.click();
  await expect(sound).not.toBeChecked();
  await page.reload();
  await closeSplash(page);
  await expect(page.getByLabel('Game sound')).not.toBeChecked();
  await expect(page.getByLabel('Game vibration')).toBeChecked();
  await more(page, /^Games/);
  await page.getByRole('link', { name: /^Trainer memory/ }).click();
  await expect(page.getByRole('link', { name: /Games/ })).toHaveCount(0);
  // In a game a swipe is a move: it does not leave the game.
  await swipe(page, 120);
  await expect(page.getByRole('heading', { name: 'Trainer memory' })).toBeVisible();
  await page.locator('.back-btn').click();
  await expect(page.getByRole('heading', { name: 'Games', level: 1 })).toBeVisible();
});

test('easter egg: 7 taps on the About logo turn the 1987 look on and unlock the secret game; 7 more turn it off', async ({ page }) => {
  await more(page, /^About/);
  const logo = page.getByRole('button', { name: 'MyGymProgression' });
  for (let i = 0; i < 4; i++) await logo.click();
  await expect(page.getByRole('status').filter({ hasText: '3 more…' })).toBeVisible();
  for (let i = 0; i < 3; i++) await logo.click();
  await expect(page.getByText('MODE 1987 ON! There is a secret game in Games.')).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('data-retro', 'on');

  await more(page, /^Games/);
  await page.getByRole('link', { name: /^Rerack!/ }).click();
  await page.getByRole('button', { name: /Play/ }).click();
  await expect(page.getByLabel('Rerack!')).toBeVisible();

  await more(page, /^About/);
  for (let i = 0; i < 7; i++) await page.getByRole('button', { name: 'MyGymProgression' }).click();
  await expect(page.getByText('Back to the present.')).toBeVisible();
  await expect(page.locator('html')).not.toHaveAttribute('data-retro');
  await more(page, /^Games/);
  await expect(page.getByRole('link', { name: /^Rerack!/ })).toBeVisible();
});

test('body map (D71): this week on Home and the period in Analysis; tapping a muscle shows its sets', async ({ page }) => {
  await page.getByRole('button', { name: 'Try with example data' }).click();
  await expect(page.getByRole('heading', { name: 'Muscles this week' })).toBeVisible();
  await expect(page.getByRole('group', { name: 'Body map' })).toBeVisible();

  await more(page, /^Reports/);
  const map = page.getByRole('group', { name: 'Body map' });
  const chest = map.getByRole('button', { name: /^Chest: \d/ }).first();
  await chest.click();
  await expect(page.getByText(/^Chest: [\d.]+ sets\/week$/)).toBeVisible();
  await expect(map.getByRole('button')).toHaveCount(25);
});

test('plan balance (D72): closed by default; shows the planned sets and updates while the plan is edited', async ({ page }) => {
  await page.getByRole('button', { name: 'Add starter exercises' }).click();
  await plans(page);
  await page.getByRole('button', { name: 'New plan' }).click();
  await page.getByLabel('Plan name').fill('Push');
  await page.getByRole('button', { name: 'Day' }).click();
  const add = async (name: string) => {
    await page.getByRole('button', { name: 'Add exercise' }).click();
    await page.getByPlaceholder('Search by name, other name or tag').fill(name);
    await page.getByRole('dialog').getByRole('button', { name: new RegExp(`^${name}`) }).click();
  };
  await add('Barbell Bench Press');
  const balance = page.getByRole('button', { name: /^Plan balance/ });
  await expect(balance).toHaveAttribute('aria-expanded', 'false');
  await balance.click();
  await expect(page.getByText(/^Push \(chest, shoulders, triceps\) 3 sets vs pull \(back, biceps\) 0\./)).toBeVisible();
  await expect(page.getByRole('group', { name: 'Body map' }).getByRole('button', { name: 'Chest: 3 sets/week' }).first()).toBeVisible();
  await add('Barbell Row');
  await expect(page.getByText(/^Push \(chest/)).toHaveCount(0);
});

test('achievements (D73): the first workout earns a medal on its summary; the page lists earned and not yet; off in Settings', async ({ page }) => {
  await planAndStart(page, ['Machine Chest Press']);
  await logChest(page, [10, 10, 10]);
  await page.getByRole('button', { name: 'Finish workout' }).click();
  await expect(page.getByRole('heading', { name: 'New achievements' })).toBeVisible();
  await expect(page.getByText('First workout')).toBeVisible();

  await more(page, /^Achievements/);
  // 18 medals; early bird or night owl may also be earned, by the time of the test run.
  await expect(page.getByText(/^[12] of 18$/)).toBeVisible();
  await expect(page.getByText('First workout')).toBeVisible();
  await expect(page.getByText('10 workouts')).toBeVisible();
  await expect(page.getByText('1 of 10', { exact: true })).toBeVisible();

  await more(page, /^Settings/);
  await page.getByLabel(/^Achievements/).click();
  // Off: not listed in More (D78); the page itself says so.
  await tab(page, 'More');
  await expect(page.getByRole('link', { name: /^Achievements/ })).toHaveCount(0);
  await page.goto('/#/achievements');
  await expect(page.getByText('Achievements are off.')).toBeVisible();
  await expect(page.getByText('First workout')).toHaveCount(0);
});

test('year in review (D74): its page in the Reports card opens screens one by one; the last one shares an image; Escape closes', async ({ page }) => {
  await page.getByRole('button', { name: 'Try with example data' }).click();
  await expect(page.getByText('Next workout')).toBeVisible();
  await more(page, /^Reports/);
  await page.getByRole('region', { name: 'Reports' }).getByRole('link', { name: /^Year in review/ }).click();
  const year = new Date().getFullYear();
  await expect(page.getByRole('heading', { name: `Your ${year} in the gym` })).toBeVisible();
  await page.getByRole('button', { name: 'See your year' }).click();

  const story = page.getByRole('dialog', { name: `Your ${year} in the gym` });
  await expect(story.getByRole('group', { name: /^Screen 1 of \d+$/ })).toBeVisible();
  await expect(story.getByRole('button', { name: 'Previous' })).toBeDisabled();
  await story.getByRole('button', { name: 'Next' }).click();
  await expect(story.getByText('workouts', { exact: true })).toBeVisible();
  await page.keyboard.press('ArrowLeft');
  await expect(story.getByRole('group', { name: /^Screen 1 of/ })).toBeVisible();
  while (await story.getByRole('button', { name: 'Next' }).isVisible()) await story.getByRole('button', { name: 'Next' }).click();

  const download = page.waitForEvent('download');
  await story.getByRole('button', { name: 'Share image' }).click();
  expect((await download).suggestedFilename()).toBe(`mygymprogression-${year}.png`);
  await page.keyboard.press('Escape');
  await expect(story).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'See your year' })).toBeVisible();
});

test('exercise sheet (D75): opens next to the name in the workout and the plan editor; the full page keeps the workout one tap away (D78)', async ({ page }) => {
  await planAndStart(page, ['Machine Chest Press']);
  await page.getByRole('button', { name: 'About Machine Chest Press' }).click();
  const sheet = page.getByRole('dialog', { name: 'Machine Chest Press' });
  await expect(sheet.getByRole('group', { name: 'Body map' })).toBeVisible();
  await expect(sheet.getByText('Primary', { exact: true })).toBeVisible();
  await sheet.getByRole('link', { name: /^Full page/ }).click();
  await expect(page.getByRole('heading', { name: 'Machine Chest Press', level: 1 })).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.locator('.active-bar').click();
  await expect(page.getByRole('button', { name: 'Set done' })).toBeVisible();
  await expect(page.locator('.active-bar')).toHaveCount(0);
});

test('plans (D77, V2-D24): a card per plan; its page has a tab per day with muscles, Start and balance; Start with a workout in progress offers to continue it; removing a logged exercise asks', async ({ page }) => {
  await page.getByRole('button', { name: 'Try with example data' }).click();
  await page.getByText('Decide for next time').waitFor();
  await tab(page, 'Train');
  const card = page.getByRole('article', { name: 'Demo Upper / Lower' });
  await expect(card).toContainText('A · Upper (Mon) · B · Lower (Thu)');
  await expect(card.getByRole('button', { name: /^Start / })).toBeVisible();
  await card.getByRole('link', { name: /^Demo Upper \/ Lower/ }).click();
  await expect(page.getByRole('heading', { name: 'Demo Upper / Lower', level: 1 })).toBeVisible();
  await page.getByRole('tab', { name: 'A · Upper' }).click();
  const upper = page.getByRole('region', { name: 'A · Upper' });
  await upper.locator('.day-muscles summary').click();
  await expect(upper.getByRole('group', { name: 'Body map' })).toBeVisible();
  await expect(page.getByRole('button', { name: /^Plan balance/ })).toBeVisible();
  await upper.getByRole('button', { name: /Start workout/ }).click();
  await expect(page.getByRole('button', { name: 'Set done' })).toBeVisible();
  await page.getByRole('link', { name: /Pause/ }).click();

  await tab(page, 'Train');
  await page.getByRole('article', { name: 'Demo Upper / Lower' }).getByRole('link', { name: /^Demo Upper \/ Lower/ }).click();
  await page.getByRole('tab', { name: 'B · Lower' }).click();
  await page.getByRole('region', { name: 'B · Lower' }).getByRole('button', { name: /Start workout/ }).click();
  const confirm = page.getByRole('dialog', { name: 'Confirm' });
  await expect(confirm).toContainText('"A · Upper" is in progress');
  await confirm.getByRole('button', { name: 'Continue that workout' }).click();
  await page.getByRole('button', { name: 'Set done' }).click();
  await page.getByRole('button', { name: 'Workout options' }).click();
  await page.getByRole('button', { name: 'Remove this exercise' }).click();
  await expect(confirm).toContainText('logged set is lost');
  await confirm.getByRole('button', { name: 'Cancel' }).click();
  await expect(page.getByRole('button', { name: 'Workout options' })).toBeVisible();
});

test('correction (D82): start and end times change the duration', async ({ page }) => {
  await planAndStart(page, ['Machine Chest Press']);
  await logChest(page, [10, 10, 10]);
  await page.getByRole('button', { name: 'Finish workout' }).click();
  await menu(page, 'Correct records');
  await page.getByLabel('Start', { exact: true }).fill('10:00');
  await page.getByLabel('End', { exact: true }).fill('11:15');
  await expect(page.getByText('Duration: 1:15:00')).toBeVisible();
  await page.getByRole('button', { name: 'Save correction' }).click();
  await expect(page.locator('.stat', { hasText: 'Duration' })).toContainText('1:15:00');
});

test('favourites (D83): the star on the exercise page; the Favourites filter; the search lists favourites first', async ({ page }) => {
  await page.getByRole('button', { name: 'Add starter exercises' }).click();
  await more(page, /^Exercises/);
  await page.getByRole('tab', { name: /^Library/ }).click();
  await page.getByLabel('Search').fill('Machine Chest Press');
  await page.getByRole('link', { name: /^Machine Chest Press/ }).click();
  await page.getByRole('button', { name: 'Mark Machine Chest Press as favourite' }).click();
  await expect(page.getByRole('button', { name: 'Remove Machine Chest Press from favourites' })).toHaveAttribute('aria-pressed', 'true');
  await page.locator('.back-btn').click();
  // A favourite is one of mine (V2-D22).
  await page.getByRole('tab', { name: /^Mine/ }).click();
  await page.getByLabel('Search').fill('');
  await page.getByRole('button', { name: 'Favourites' }).click();
  await expect(page.getByRole('button', { name: 'Favourites' })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByText('1 exercise', { exact: true })).toBeVisible();
  await plans(page);
  await page.getByRole('button', { name: 'New plan' }).click();
  await page.getByRole('button', { name: 'Day' }).click();
  await page.getByRole('button', { name: 'Add exercise' }).click();
  const picker = page.getByRole('dialog', { name: 'Choose exercise' });
  await expect(picker.getByText('Your favourites. Type to search all exercises.')).toBeVisible();
  await expect(picker.locator('.pick')).toHaveCount(1);
  await picker.getByPlaceholder('Search by name, other name or tag').fill('Press');
  await expect(picker.locator('.pick').first()).toContainText('Machine Chest Press');
  expect(await picker.locator('.pick').count()).toBeGreaterThan(1);
});

test('v2: effort (RIR), rest timer and plates per side in the workout', async ({ page }) => {
  await planAndStart(page, ['Barbell Back Squat']);
  const squat = page.getByRole('region', { name: 'Barbell Back Squat' });
  await squat.getByLabel('Load', { exact: true }).fill('60');
  await expect(squat.locator('.plates b')).toHaveText('20');
  await squat.getByRole('button', { name: 'RIR 2' }).click();
  await expect(squat.getByRole('button', { name: 'RIR 2' })).toHaveAttribute('aria-pressed', 'true');
  await squat.getByLabel('Reps', { exact: true }).fill('8');
  await squat.getByRole('button', { name: 'Set done' }).click();
  const rest = page.getByRole('region', { name: 'Rest' });
  await expect(rest.getByRole('timer')).toBeVisible();
  await rest.getByRole('button', { name: '15 seconds more' }).click();
  await rest.getByRole('button', { name: 'Skip' }).click();
  await expect(rest).toHaveCount(0);
  // The set table: the done set shows its values and effort; the next sets have a ✓ of their own.
  await expect(squat.getByRole('button', { name: 'Set 1: 8 × 60 kg' })).toBeVisible();
  await expect(squat.locator('.st-eff').first()).toHaveText('2');
  await expect(squat.getByRole('button', { name: 'Set 3 done' })).toBeVisible();
});

test('v2: an exercise has its own bar weight; the plates per side use it (V2-D26)', async ({ page }) => {
  await planAndStart(page, ['Barbell Back Squat']);
  const squat = page.getByRole('region', { name: 'Barbell Back Squat' });
  await squat.getByLabel('Load', { exact: true }).fill('60');
  await expect(squat.locator('.plates b')).toHaveText('20');
  // Edit the exercise from its sheet: a 10 kg bar instead of the 20 kg of the settings.
  await squat.getByRole('button', { name: 'About Barbell Back Squat' }).click();
  await page.getByRole('dialog').getByRole('link', { name: /^Full page/ }).click();
  await page.getByRole('link', { name: 'Edit', exact: true }).click();
  const bar = page.getByLabel('Bar weight (kg)', { exact: true });
  await expect(bar).toHaveAttribute('placeholder', '20');
  await bar.fill('10');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Continue' }).click();
  await expect(squat.getByLabel('Load', { exact: true })).toHaveValue('60');
  await expect(squat.locator('.plates b')).toHaveText('25');
  await expect(squat.locator('.plates')).toContainText('Bar 10 kg');
});

test('v2: the actions under the sets are in three groups (V2-D27)', async ({ page }) => {
  await planAndStart(page, ['Machine Chest Press']);
  const chest = page.getByRole('region', { name: 'Machine Chest Press' });
  await expect(chest.getByRole('button', { name: 'Set', exact: true })).toBeVisible();
  await expect(chest.getByRole('button', { name: 'Substitute', exact: true })).toBeVisible();
  const flags = chest.getByRole('group', { name: 'Flag' });
  await expect(flags).toContainText('no increase this time');
  await flags.getByRole('button', { name: 'Pain' }).click();
  await expect(flags.getByRole('button', { name: 'Pain' })).toHaveAttribute('aria-pressed', 'true');
  await expect(flags.getByRole('button', { name: 'Technique' })).toBeInViewport();
  await expect(chest.getByRole('button', { name: 'Setup', exact: true })).toBeInViewport();
});

test('v2: the quick view sets the effort (RIR) of a set (V2-D28)', async ({ page }) => {
  await planAndStart(page, ['Machine Chest Press']);
  await page.getByRole('button', { name: 'Quick view' }).click();
  const quick = page.getByRole('region', { name: 'Quick view' });
  await quick.getByRole('button', { name: /^Change Set 1:/ }).click();
  await quick.getByRole('button', { name: 'RIR 2', exact: true }).click();
  await expect(quick.getByRole('button', { name: 'RIR 2', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await quick.getByRole('button', { name: 'OK' }).click();
  await expect(quick.getByRole('button', { name: /^Change Set 1:.* 20 kg · RIR 2$/ })).toBeVisible();
  await quick.getByRole('button', { name: 'Set 1 done' }).click();
  // The normal view shows the same effort in the set table.
  await page.getByRole('button', { name: 'Quick view' }).click();
  await expect(page.getByRole('region', { name: 'Machine Chest Press' }).locator('.st-eff').first()).toHaveText('2');
});

test('v2: tools estimate the 1RM and the plates per side', async ({ page }) => {
  await more(page, /^Tools/);
  await page.getByLabel('Load (kg)', { exact: true }).fill('100');
  await page.getByLabel('Reps', { exact: true }).fill('10');
  await expect(page.locator('.tool-result .big').first()).toHaveText('133.3');
  await page.getByLabel('Total load (kg)', { exact: true }).fill('102.5');
  await expect(page.getByText('25 + 15 + 1.25')).toBeVisible();
});

test('v2: body weight from the Weight shortcut, shown in Progress → Body', async ({ page }) => {
  await page.getByRole('button', { name: 'Weight', exact: true }).click();
  const form = page.getByRole('dialog', { name: 'Log weight' });
  await form.getByLabel('Body weight (kg)', { exact: true }).fill('78.4');
  await form.getByRole('button', { name: 'Save' }).click();
  await expect(page.locator('.tool-result .big')).toHaveText('78.4');
  await expect(page.getByRole('navigation', { name: 'Progress' }).getByRole('link', { name: 'Body' })).toHaveAttribute('aria-current', 'page');
});

test('v2: recovery map on Home; strength balance in Tools from the barbell lifts', async ({ page }) => {
  await page.getByRole('button', { name: 'Try with example data' }).click();
  await expect(page.getByRole('heading', { name: 'Muscles this week' })).toBeVisible();
  await page.getByRole('radio', { name: 'Recovery' }).click();
  await expect(page.getByRole('heading', { name: 'Muscle recovery' })).toBeVisible();
  await expect(page.getByText('Tired (5+)')).toBeVisible();
  await page.getByRole('group', { name: 'Body map' }).getByRole('button', { name: /^Quadriceps: / }).first().click();
  await expect(page.getByText(/^Quadriceps: (Recovered|Recovering|Tired) · [\d.]+ recent sets$/)).toBeVisible();

  await more(page, /^Tools/);
  const card = page.locator('#balance');
  await expect(card.getByRole('heading', { name: 'Strength balance' })).toBeVisible();
  await expect(card.getByText('Barbell Back Squat')).toBeVisible();
  await expect(card.getByText('Missing: Bench press.')).toBeVisible();
  await expect(card.getByText('Missing: Deadlift.')).toBeVisible();
});
