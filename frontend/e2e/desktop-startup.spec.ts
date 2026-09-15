import { expect, test } from '@playwright/test';

/**
 * The packaged desktop startup path, as far as a browser can stand in for it.
 *
 * In the desktop build the webview asks the Tauri host for a loopback endpoint and
 * a per-launch credential before there is an application to mount. When that call
 * fails, the surface a Windows user sees must be about the service they cannot
 * reach and the two things they can do about it - not about a Python API, a bearer
 * token, or a localhost port, none of which they can act on.
 *
 * The host is stubbed rather than mocked at the network layer, because the thing
 * under test is which branch the product takes once it believes it is the desktop
 * build (`isDesktop`), and that decision is made from the presence of the host
 * bridge.
 */
test('a desktop host that cannot hand over a connection reports product language', async ({
  page,
}) => {
  const consoleErrors: string[] = [];
  page.on('pageerror', error => consoleErrors.push(error.message));

  await page.addInitScript(() => {
    (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__ = {
      invoke: () =>
        Promise.reject(new Error('cca-sidecar exited during startup')),
    };
  });
  await page.goto('/');

  await expect(page.getByRole('heading', { name: 'Concord' })).toBeVisible();
  await expect(page.getByRole('alert')).toHaveText(
    '无法连接 Concord 本地服务。',
  );
  await expect(page.getByRole('button', { name: '重新连接' })).toBeEnabled();

  // The implementation is stated, and it is not the message.
  const body = (await page.locator('body').innerText()).toLowerCase();
  for (const leak of ['python api', 'bearer', 'api token', '127.0.0.1', 'uvicorn'])
    expect(body).not.toContain(leak);

  // No credential is ever asked for on the desktop path.
  await expect(page.locator('input[type=password]')).toHaveCount(0);
  expect(consoleErrors).toEqual([]);
});
