import { MANAGER_DESK } from '../client/src/world/layout';
import { enterOffice, expect, startAt, test } from './helpers';

test('Deutsch ist Standard; Sprachwahl wirkt sofort und URL-Vorgaben bleiben lokal', async ({ page }) => {
  // Dieser Test prüft HTML-Dialoge; Low vermeidet teure Software-WebGL-Effekte.
  await page.addInitScript(() => localStorage.setItem('cubefarm:graphics', 'low'));
  await startAt(page, { floor: 0, x: MANAGER_DESK.x, z: MANAGER_DESK.z + MANAGER_DESK.d / 2 + 0.8, yaw: 0, pitch: -0.6 });
  const state = await (await page.request.get('/api/state')).json();
  expect(state.settings.language).toBe('de');
  await page.goto('/');
  await enterOffice(page, { loaded: true });
  await expect(page.locator('html')).toHaveAttribute('lang', 'de');
  await page.keyboard.press('e');
  await page.getByRole('tab', { name: /Settings/ }).click();
  const select = page.getByLabel('Sprache / Language');
  await expect(select).toHaveValue('de');
  await select.selectOption('en');
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await expect(select).toBeEnabled();
  await page.getByRole('tab', { name: /Team/ }).click();
  await page.getByRole('button', { name: 'Let go', exact: true }).first().click();
  const dialog = page.getByRole('alertdialog');
  await expect(dialog.getByRole('button', { name: 'Cancel', exact: true })).toBeVisible();
  expect((await page.request.patch('/api/settings', { data: { language: 'de' } })).ok()).toBe(true);
  await expect(dialog.getByRole('button', { name: 'Abbrechen', exact: true })).toBeVisible();
  await dialog.getByRole('button', { name: 'Abbrechen', exact: true }).click();
  await page.getByRole('tab', { name: /Settings/ }).click();
  await select.selectOption('en');
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await expect(select).toBeEnabled();
  await select.selectOption('de');
  await expect(page.locator('html')).toHaveAttribute('lang', 'de');
  await page.reload();
  await enterOffice(page, { loaded: true });
  await expect(page.locator('html')).toHaveAttribute('lang', 'de');
  await page.goto('/?lang=en');
  await enterOffice(page, { loaded: true });
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  expect((await (await page.request.get('/api/state')).json()).settings.language).toBe('de');
  await page.keyboard.press('e');
  await page.getByRole('tab', { name: /Settings/ }).click();
  await expect(page.getByText('This tab uses the language from the URL.', { exact: false })).toBeVisible();
});

test('ungültige Sprache wird ohne Änderung der Einstellungen abgelehnt', async ({ request }) => {
  for (const language of ['fr', '', null, 7]) {
    const response = await request.patch('/api/settings', { data: { language, companyName: 'Must not be applied' } });
    expect(response.status()).toBe(400);
    expect(await response.json()).toHaveProperty('error');
  }
  const state = await (await request.get('/api/state')).json();
  expect(state.settings.language).toBe('de');
  expect(state.settings.companyName).not.toBe('Must not be applied');
});
