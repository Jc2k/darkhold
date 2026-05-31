# [1.82.0](https://github.com/Jc2k/darkhold/compare/v1.81.1...v1.82.0) (2026-05-31)

### Features

- **shopping-list:** trigger action on full swipe ([203b2e6](https://github.com/Jc2k/darkhold/commit/203b2e6168b71f87527c7be681e6277ac1045ec0))

## [1.81.1](https://github.com/Jc2k/darkhold/compare/v1.81.0...v1.81.1) (2026-05-31)

### Bug Fixes

- lint ([5e43647](https://github.com/Jc2k/darkhold/commit/5e436472b7d88875df0c9e660bf24d1849286c58))
- **shopping-list:** improve to check controls ([3feb7a1](https://github.com/Jc2k/darkhold/commit/3feb7a11dea523815533a645fc7f78ef97ab91a4))

# [1.81.0](https://github.com/Jc2k/darkhold/compare/v1.80.10...v1.81.0) (2026-05-30)

### Bug Fixes

- **dashboard:** preserve meal notes in recipe card mock ([3ce146e](https://github.com/Jc2k/darkhold/commit/3ce146ea08c9b57e0b44d811ff55568493aac8a5))
- **dashboard:** render upcoming meal notes inside cards ([634aa6d](https://github.com/Jc2k/darkhold/commit/634aa6d799d72104a54c90538fbe307ce82fb2c1))

### Features

- **shopping-list:** add to check workflow ([8308fdb](https://github.com/Jc2k/darkhold/commit/8308fdb60045d3f116b2ddf014f903d7dda7f716))

## [1.80.10](https://github.com/Jc2k/darkhold/compare/v1.80.9...v1.80.10) (2026-05-29)

### Bug Fixes

- remove extra-request fallbacks from meal plan redirect ([af35c53](https://github.com/Jc2k/darkhold/commit/af35c53d94cbb11f192844b613c5506fa16c8619))
- remove recipe_mealplan fallbacks, use list_recipe_data.meal_plan_data.from_date throughout ([b55e9a1](https://github.com/Jc2k/darkhold/commit/b55e9a18515a554e5a864d488c7414062053699a))
- use list_recipe_data.meal_plan_data.from_date for meal plan redirect ([e21bbe5](https://github.com/Jc2k/darkhold/commit/e21bbe51b99331196f7f85740213a75be3eef95c))

## [1.80.9](https://github.com/Jc2k/darkhold/compare/v1.80.8...v1.80.9) (2026-05-29)

### Bug Fixes

- **meal-plan:** dedupe redirect week refresh queries ([9df9a85](https://github.com/Jc2k/darkhold/commit/9df9a8545cd62dfac0debff9ddcc133e0ad25ec6))
- **meal-plan:** refresh redirect week cache on shopping list changes ([34d771f](https://github.com/Jc2k/darkhold/commit/34d771f0c9d62a8b088168c7d2fc0515cef96b76))
- **shopping-list:** keep recipe entries in api order ([05b09f6](https://github.com/Jc2k/darkhold/commit/05b09f6f6f10307d8db4438f3114ebdedf5f05aa))

## [1.80.8](https://github.com/Jc2k/darkhold/compare/v1.80.7...v1.80.8) (2026-05-28)

### Bug Fixes

- sort recipe groups by meal-type order before time to match meal plan ([b472946](https://github.com/Jc2k/darkhold/commit/b4729469522105bbe6b60711ea48119d1731d32f))
- use meal plan data as date source for shopping list recipe group ordering ([f92b638](https://github.com/Jc2k/darkhold/commit/f92b638362ff965fbf03a7678d34d40e1ea61d72))

## [1.80.7](https://github.com/Jc2k/darkhold/compare/v1.80.6...v1.80.7) (2026-05-28)

### Bug Fixes

- **meal-plan:** guard assistant clear during shopping refresh ([c080a6a](https://github.com/Jc2k/darkhold/commit/c080a6a5eca39d4cd9219e9a746f2d98ff88693a))

## [1.80.6](https://github.com/Jc2k/darkhold/compare/v1.80.5...v1.80.6) (2026-05-28)

### Bug Fixes

- **cache:** invalidate redirect and shopping caches on socket connect ([4d9ebcd](https://github.com/Jc2k/darkhold/commit/4d9ebcd5a347f6e2a018f36c8fe9c756dbe9dcfc))

## [1.80.5](https://github.com/Jc2k/darkhold/compare/v1.80.4...v1.80.5) (2026-05-28)

### Bug Fixes

- clearing shopping list now ends meal planning assistance ([ea580f0](https://github.com/Jc2k/darkhold/commit/ea580f06fc2d1749db5994c504ce8b3a308ef676))

## [1.80.4](https://github.com/Jc2k/darkhold/compare/v1.80.3...v1.80.4) (2026-05-28)

### Bug Fixes

- **meal-plan:** avoid premature assistant shutdown ([45d3ee2](https://github.com/Jc2k/darkhold/commit/45d3ee2e4d67b96a3377121614e2f6c73ff2045a))

## [1.80.3](https://github.com/Jc2k/darkhold/compare/v1.80.2...v1.80.3) (2026-05-28)

### Bug Fixes

- **meal-plan:** enforce assistant session lifecycle via shopping list ([f4223a6](https://github.com/Jc2k/darkhold/commit/f4223a6c9b16b440e8135855e2e29e9a253f9582))
- **meal-plan:** refine shopping-list expiry effect dependencies ([5304e87](https://github.com/Jc2k/darkhold/commit/5304e87575f48d0c4c87d5791ef39d7d6fdb677a))

# Changelog

All notable changes to this project will be documented in this file.

This file is automatically maintained by semantic-release.
