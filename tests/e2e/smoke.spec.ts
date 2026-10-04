import { expect, test } from "@playwright/test";

// Each game: from the home page, choose it, play against bots and get a dealt table.
const games = [
  { name: "Blackjack", slug: "blackjack", start: "Deal", dealt: /Your hand:/ },
  { name: "Crazy Eights", slug: "crazy-eights", start: "Start Game", dealt: /Draw a card/ },
  { name: "Go Fish", slug: "go-fish", start: "Deal cards", dealt: /Ask for/ },
  { name: "Yaniv", slug: "yaniv", start: "Start Game", dealt: /Hand total/ },
];

for (const game of games) {
  test(`${game.name}: pick it on the home page and deal a game against bots`, async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: new RegExp(game.name) }).click();
    await page.getByRole("button", { name: /Play vs Bot/ }).click();
    await expect(page).toHaveURL(new RegExp(`/play/${game.slug}$`));

    await page.getByRole("button", { name: game.start, exact: true }).click();

    await expect(page.getByText(game.dealt).or(page.getByLabel(game.dealt)).first()).toBeVisible();
  });
}
