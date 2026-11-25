import { expect, test } from '@playwright/test';

const articles = Array.from({ length: 65 }, (_, index) => ({
  title: `Community report ${String(index + 1).padStart(3, '0')}`,
  description: 'Local reporting about shared spaces and everyday life.',
  url: `https://example.com/report-${index}`,
  source: { name: 'Community Journal' },
  publishedAt: new Date(Date.UTC(2026, 10, 25, 6, index)).toISOString(),
}));

test.beforeEach(async ({ page }) => {
  await page.route('https://raw.githubusercontent.com/pranav256/news-api/main/**', (route) =>
    route.fulfill({ json: {
      fetched_at: '2026-11-25T08:00:00Z',
      articles: route.request().url().includes('/us/') ? articles.slice(0, 5) : articles,
    } }),
  );
});

test('scrolling appends unique stories, reaches the end, and resets for a new country', async ({ page }) => {
  await page.goto('/?country=in&category=general');
  const stories = page.getByRole('region', { name: 'Stories', exact: true }).getByRole('article');
  await expect(stories).toHaveCount(12);
  const firstTitle = await stories.first().getByRole('heading').innerText();
  await stories.first().getByRole('button', { name: /^Save story:/ }).click();
  for (const count of [24, 36, 48, 60, 65]) {
    await page.evaluate(() => window.scrollTo({ top: document.body.scrollHeight, behavior: 'instant' }));
    await expect(stories).toHaveCount(count);
  }
  const urls = await stories.locator('h3 a').evaluateAll((links) => links.map((link) => link.getAttribute('href')));
  expect(new Set(urls).size).toBe(65);
  await expect(stories.first().getByRole('heading')).toHaveText(firstTitle);
  await expect(stories.first().getByRole('button', { name: /^Remove saved story:/ })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByText('You’re up to date with this edition.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Load more stories' })).toHaveCount(0);
  await page.getByRole('group', { name: 'Country', exact: true }).getByRole('button', { name: 'United States' }).click();
  await expect(stories).toHaveCount(5);
  await expect(page.getByRole('region', { name: 'Stories', exact: true }).getByRole('status')).toHaveText('Showing 5 of 5 stories');
  await expect.poll(() => page.evaluate(() => scrollY)).toBe(0);
});

test('manual loading works without IntersectionObserver and focuses the first added story', async ({ page }) => {
  await page.addInitScript(() => { delete (window as unknown as Record<string, unknown>).IntersectionObserver; });
  await page.goto('/?country=in&category=general');
  const stories = page.getByRole('region', { name: 'Stories', exact: true }).getByRole('article');
  await expect(stories).toHaveCount(12);
  await page.getByRole('button', { name: 'Load more stories' }).focus();
  await page.keyboard.press('Enter');
  await expect(stories).toHaveCount(24);
  await expect(stories.nth(12).locator('h3 a')).toBeFocused();
  await page.getByRole('searchbox', { name: 'Search stories', exact: true }).fill('Community report 001');
  await expect(stories).toHaveCount(1);
  await expect(stories.first().getByRole('heading')).toHaveText('Community report 001');
});
