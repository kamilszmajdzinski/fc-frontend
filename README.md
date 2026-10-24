# fc-frontend

Web app for pastry chefs: recipes, ingredients, stock and food cost. It implements the screens from [designs/FoodCost Web Minimal.html](designs/FoodCost%20Web%20Minimal.html) that the backend ([fc-backend](../fc-backend), API reference in `fc-backend/docs/API.md`) supports today.

Stack: React 19, TypeScript, Vite, React Router, TanStack Query. Plain CSS modules, with the theme defined as CSS variables.

## Getting started

Start the backend first (it listens on `http://localhost:3000`):

```bash
cd ../fc-backend
npm install && npm run migrate && npm run seed
npm run dev
```

Then the frontend:

```bash
npm install
npm run dev       # http://localhost:5173
```

In development the app calls `/api/v1/...` on its own origin, and Vite forwards those requests to the backend, so CORS doesn't come into play.

| Script | What it does |
|---|---|
| `npm run dev` | Dev server with hot reload |
| `npm run build` | Type-check, then build to `dist/` |
| `npm run preview` | Serve the production build locally (uses the same `/api` proxy) |
| `npm run typecheck` | TypeScript only |
| `npm test` | Unit tests (Vitest) for units, formatting, food cost and form logic |

Configuration lives in `.env` (see [.env.example](.env.example)):

| Variable | Used by | Default |
|---|---|---|
| `VITE_API_URL` | The browser. Set it for production builds, e.g. `https://api.example.com/api/v1`. | `/api/v1` |
| `API_PROXY_TARGET` | The dev/preview server's `/api` proxy. | `http://localhost:3000` |
| `VITE_SUPABASE_URL` | Login. The Supabase project URL. | none (required) |
| `VITE_SUPABASE_ANON_KEY` | Login. The project's anon (public) key. | none (required) |

**Login.** Users log in with Google through Supabase Auth (`/login`). Every other page needs a session, and every API request sends its access token (`Authorization: Bearer ...`). A `401` from the API logs the user out. Logging out, or switching to another account, clears all cached data. For local login, add `http://localhost:5173/**` to the redirect URLs in Supabase (Authentication → URL Configuration).

## What is implemented

| Design screen | Status |
|---|---|
| **Przepisy** (recipes) | List, detail, create, edit and delete. The detail view shows the cost breakdown, steps and a **cost history** ("Historia kosztów"): each change, why it happened (recipe edited, or an ingredient's price changed, linked to that ingredient) and by how much. The editor has a live cost preview, unit pickers limited to compatible units, and a "+ Nowy składnik" dialog that creates an ingredient on the spot. |
| **Składniki** (ingredients) | List with search, a read-only view (prices, stock, the recipes that use it and how much, and a **price history**, "Historia cen", with the recipes each change recalculated) and a separate edit mode. Save is enabled only once something has changed. You type either the package price or the price per kg/l/piece, and the other one is calculated. While you edit a price, package size or unit, the form previews each affected recipe's new food cost. Saving then asks you to confirm those changes, and afterwards a notification shows the values the backend recalculated. A unit change that recipes can't follow (e.g. g → szt) is flagged before saving. Deleting an ingredient that recipes use is blocked, and those recipes are linked. |
| **Magazyn** (stock) | Stock per ingredient (`inventoryQuantity`): value, out-of-stock filter, add/subtract/set, quick buttons, "+1 package". |
| **Kalkulator** | Food cost %, profit and suggested price (at 30% FC) for any recipe, with custom portions (ingredients scale). It starts from the recipe's saved selling price and can save a new one ("Zapisz cenę w przepisie", only at the recipe's own portion count). |
| **Aktywność** (activity, not in the design) | The change log of everything (`GET /changes`), grouped by day and filterable by ingredients or recipes. "Pokaż starsze zmiany" loads older entries a page at a time. A price change shows the recipes it recalculated underneath, and those recipe entries aren't listed again. Deleted items are tagged "usunięty" and link to `/activity/:type/:id`, their change log, which still works after deletion. |

**Selling price (`sellPrice`)** is optional and covers the whole recipe. It can be set in the recipe editor (with a live food cost % in the cost preview) or from the calculator. With a price, the recipe list shows a food cost badge (green ≤ 30%, orange ≤ 40%, red above; "!" when above target). The detail page shows Foodcost and Zysk (profit) cards, plus a warning with a one-click "Ustaw …" button for the suggested price when the price no longer meets the 30% target, e.g. after an ingredient got more expensive. The ingredient price preview and confirmation also mark recipes that would cross the target.

**Sub-recipes (podprzepisy).** A recipe can be an ingredient of another one, e.g. a tart made from a tart base and a cream. The ingredient search has two groups, "Składniki" and "Przepisy". It leaves out the recipe being edited and the recipes that already use it. A sub-recipe line starts as 1 portion ("porcja"). Grams, kilograms and so on are offered only when the sub-recipe has a yield ("Wydajność", e.g. 550 g, set in its basic information), and a row without one says so and links to where it can be set. The live cost preview uses the same maths as the API. On the detail page, sub-recipe lines are tagged "przepis" and link to that recipe, and a "Używany w przepisach" card lists the recipes that use it. If a recipe is still used by others, deleting it is blocked and those recipes are linked. Removing a yield, or changing its kind, while others use the recipe in grams is rejected; the yield field is flagged and the banner links those recipes. A deeper loop (A → B → A) that the search can't see is reported on the row in Polish. A change to a product's price or to a sub-recipe updates every recipe that uses it, at every level. The cost history explains it, e.g. "Masło 82%: 8,00 zł → 10,00 zł, przez przepis Kruche ciasto na tartę".

Each ingredient and recipe page has a **Historia** card with two tabs: **Wszystkie zmiany** (every change from the change log, including ingredient-list diffs and what caused a cost change) and **Ceny** / **Koszty** (the price or cost timeline).

Not built yet, because the backend has no support for them:

- **Faktury** (invoices and receipt scanning)
- **Login / registration** and the account menu
- **Minimum stock level**, and with it the "Mało" (low stock) status and threshold card in Magazyn

The backend also has fields that the design doesn't show. The UI uses them in the same visual style: recipe description and steps, and ingredient manufacturer and description.

## Project layout

```
src/
  main.tsx            QueryClient, toasts, router
  router.tsx          routes and the app shell
  api/                types (copied from API.md), fetch client, TanStack Query hooks
  lib/                units, formatting (pl-PL, PLN), food cost rules, search
  components/         UI building blocks: header, list/detail layout, form controls, modal, toast
  features/
    recipes/          list, detail, editor (+ recipeFormModel.ts: pure form logic)
    products/         list, editor (+ productFormModel.ts: pure form logic)
    inventory/        stock screen
    calculator/       food cost calculator
  styles/theme.css    design tokens (colours, fonts, radii)
```

URLs: `/recipes`, `/recipes/:id`, `/recipes/:id/edit`, `/recipes/new`, `/products/new`, `/products/:id` (read-only), `/products/:id/edit`, `/inventory[/:id]`, `/calculator[/:recipeId]`, `/activity`, `/activity/product/:id`, `/activity/recipe/:id`.

## Notes

- **Theming.** Every colour, font and radius comes from `src/styles/theme.css`. A different theme, for example for another industry, only needs to override those variables.
- **Locale.** Money is formatted as PLN with Polish number formatting (`3,49 zł`). Inputs accept both `3,49` and `3.49`. Locale and currency are set in one place, `src/lib/format.ts`.
- **Costs** shown after saving always come from the server. The editor's live preview uses the same maths as the backend (`src/lib/units.ts`).
- **Lists** are sorted with Polish collation on the client, because the database's byte order puts "Ś" after "Z".
