import { Fragment, useEffect, useId, useMemo, useRef, useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import { ApiRequestError, errorMessage } from '../../api/client';
import { useCreateProduct } from '../../api/products';
import { useRecipeUsedIn } from '../../api/recipes';
import type { IngredientUnit, Product, Recipe, RecipeInput, RecipeSummary, YieldUnit } from '../../api/types';
import { Modal } from '../../components/Modal';
import { FoodCostBadge } from '../../components/FoodCostBadge';
import { RecipeLinks } from '../../components/RecipeLinks';
import { SearchSelect, type SearchOption } from '../../components/SearchSelect';
import { StepperInput } from '../../components/StepperInput';
import { useToast } from '../../components/Toast';
import {
  Banner,
  Button,
  Card,
  cx,
  Eyebrow,
  Field,
  Input,
  NumberInput,
  PillButton,
  RemoveButton,
  Select,
  TextArea,
} from '../../components/ui';
import { profitability, suggestedPrice, TARGET_FOOD_COST } from '../../lib/foodcost';
import { formatMoney, formatQuantity, portionsLabel, toInputValue } from '../../lib/format';
import { compatibleUnits, subRecipeUnits, unitLabel, YIELD_UNITS } from '../../lib/units';
import { packageLabel, unitPriceLabel } from '../products/labels';
import { ProductForm } from '../products/ProductForm';
import { toProductInput } from '../products/productFormModel';
import {
  emptyIngredientRow,
  hasErrors,
  initialRecipeForm,
  newRowKey,
  parsePortions,
  parseSellPrice,
  previewFoodCost,
  rowCost,
  rowRef,
  serverRowMessages,
  toRecipeInput,
  validateRecipeForm,
  withProduct,
  withRecipe,
  type Catalog,
  type IngredientRow,
  type RecipeFormErrors,
  type RecipeFormValues,
} from './recipeFormModel';
import { PriceAlert } from './PriceAlert';
import alertStyles from './PriceAlert.module.css';
import styles from './RecipeForm.module.css';

interface RecipeFormProps {
  /** The recipe being edited. Leave out to create a new one. */
  recipe?: Recipe;
  products: Product[];
  /** All recipes: the ones that can be used as sub-recipes, and their costs for the preview. */
  recipes: RecipeSummary[];
  busy: boolean;
  /** The last save's error, if any. */
  error?: Error | null;
  onSubmit: (input: RecipeInput) => void;
  onCancel: () => void;
}

const NO_ERRORS: RecipeFormErrors = { rows: {} };

const PRODUCTS_GROUP = 'Składniki';
const RECIPES_GROUP = 'Przepisy';

/** "8 porcji · 2,28 zł / porcja · 550 g" for a recipe in the ingredient search. */
function recipeMeta(recipe: RecipeSummary): string {
  return [
    portionsLabel(recipe.portions),
    `${formatMoney(recipe.costPerPortion)} / porcja`,
    recipe.yieldQuantity !== null && recipe.yieldUnit ? `${formatQuantity(recipe.yieldQuantity)} ${unitLabel(recipe.yieldUnit)}` : null,
  ]
    .filter(Boolean)
    .join(' · ');
}

export function RecipeForm({ recipe, products, recipes, busy, error, onSubmit, onCancel }: RecipeFormProps) {
  const id = useId();
  const [values, setValues] = useState(() => initialRecipeForm(recipe));
  const [showErrors, setShowErrors] = useState(false);
  // The form as it was sent, so the server's "ingredients[2]" points at the right row even after edits.
  const [submitted, setSubmitted] = useState<RecipeFormValues | null>(null);
  // The "new ingredient" dialog: opened from the header (fills the first empty row) or from a row's search.
  const [newProduct, setNewProduct] = useState<{ rowKey: string | null; name: string } | null>(null);
  // Rows added by the user get focus; rows loaded with the recipe do not.
  const [focusKey, setFocusKey] = useState<string | null>(null);
  // Recipes that use this one can't become its ingredients (that would be a loop).
  const usedIn = useRecipeUsedIn(recipe?.id);

  const catalog = useMemo<Catalog>(
    () => ({
      products: new Map(products.map((product) => [product.id, product])),
      recipes: new Map(recipes.map((r) => [r.id, r])),
    }),
    [products, recipes],
  );
  const options = useMemo<SearchOption<string>[]>(() => {
    const excluded = new Set([recipe?.id, ...(usedIn.data ?? []).map((r) => r.id)]);
    const recipeOptions = recipes
      .filter((r) => !excluded.has(r.id))
      .map((r) => ({ value: `r:${r.id}`, label: r.name, meta: recipeMeta(r), group: RECIPES_GROUP }));
    // Headings only when there is something to tell apart.
    const productGroup = recipeOptions.length > 0 ? PRODUCTS_GROUP : undefined;
    const productOptions = products.map((product) => ({
      value: `p:${product.id}`,
      label: product.name,
      meta: [product.manufacturer, packageLabel(product), unitPriceLabel(product)].filter(Boolean).join(' · '),
      keywords: product.manufacturer,
      group: productGroup,
    }));
    return [...productOptions, ...recipeOptions];
  }, [products, recipes, recipe?.id, usedIn.data]);
  const quantityId = (rowKey: string) => `${id}-quantity-${rowKey}`;

  // The row that already holds an ingredient the user just picked again: highlighted with a short note.
  const [duplicateKey, setDuplicateKey] = useState<string | null>(null);
  const duplicateTimer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(duplicateTimer.current), []);

  // After picking an ingredient the next thing to type is its amount.
  function focusQuantity(rowKey: string, select = false) {
    window.setTimeout(() => {
      const input = document.getElementById(quantityId(rowKey)) as HTMLInputElement | null;
      input?.focus();
      if (select) input?.select();
    }, 0);
  }

  /**
   * Picking an ingredient that another row already has doesn't add it twice: the empty row goes away
   * and the existing row's amount gets focus, with a note saying why.
   */
  function pickIngredient(rowKey: string, ref: string) {
    const [kind, rawId] = ref.split(':');
    const product = kind === 'p' ? catalog.products.get(Number(rawId)) : undefined;
    const subRecipe = kind === 'r' ? catalog.recipes.get(Number(rawId)) : undefined;
    if (!product && !subRecipe) return;
    const current = values.ingredients.find((row) => row.key === rowKey);
    const existing = values.ingredients.find((row) => rowRef(row) === ref && row.key !== rowKey);
    if (!existing) {
      updateRow(rowKey, (row) => (product ? withProduct(row, product) : withRecipe(row, subRecipe!)));
      focusQuantity(rowKey, !!subRecipe);
      return;
    }
    if (current && rowRef(current) === null) {
      setValues((form) => ({ ...form, ingredients: form.ingredients.filter((row) => row.key !== rowKey) }));
    }
    focusQuantity(existing.key, true);
    setDuplicateKey(existing.key);
    window.clearTimeout(duplicateTimer.current);
    duplicateTimer.current = window.setTimeout(() => setDuplicateKey(null), 4000);
  }

  // What each row holds, so the search can tag the ones already in the recipe.
  const usedRefs = values.ingredients.map(rowRef);
  const errors = validateRecipeForm(values, catalog);
  const visible = showErrors ? errors : NO_ERRORS;
  const portions = parsePortions(values.portions);
  const typedSellPrice = parseSellPrice(values.sellPrice);
  const sellPrice = typedSellPrice !== null && Number.isNaN(typedSellPrice) ? null : typedSellPrice;
  const total = previewFoodCost(values, catalog);

  // Server errors: a row's message stays until that row is changed.
  const apiError = error instanceof ApiRequestError ? error : null;
  const rowMessages = useMemo(
    () => (apiError && submitted ? serverRowMessages(apiError.issues, submitted) : {}),
    [apiError, submitted],
  );
  const submittedRows = new Map(submitted?.ingredients.map((row) => [row.key, row]));
  const yieldConflict = apiError?.code === 'UNIT_CONFLICT' ? apiError.recipes : null;

  function set<K extends keyof RecipeFormValues>(key: K, value: RecipeFormValues[K]) {
    setValues((current) => ({ ...current, [key]: value }));
  }

  function updateRow(key: string, change: (row: IngredientRow) => IngredientRow) {
    setValues((current) => ({
      ...current,
      ingredients: current.ingredients.map((row) => (row.key === key ? change(row) : row)),
    }));
  }

  function addRow() {
    const row = emptyIngredientRow();
    setFocusKey(row.key);
    setValues((current) => ({ ...current, ingredients: [...current.ingredients, row] }));
  }

  // A product created in the dialog fills the row it was searched in; from the header, the first empty row or a new one.
  function addCreatedProduct(product: Product, rowKey: string | null) {
    setNewProduct(null);
    const target =
      values.ingredients.find((row) => row.key === rowKey) ?? values.ingredients.find((row) => rowRef(row) === null);
    if (target) {
      updateRow(target.key, (row) => withProduct(row, product));
      focusQuantity(target.key);
    } else {
      const row = emptyIngredientRow(product);
      setValues((current) => ({ ...current, ingredients: [...current.ingredients, row] }));
      focusQuantity(row.key);
    }
  }

  function addStep() {
    const key = newRowKey();
    setFocusKey(key);
    setValues((current) => ({ ...current, steps: [...current.steps, { key, text: '' }] }));
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    if (hasErrors(errors)) {
      setShowErrors(true);
      return;
    }
    setSubmitted(values);
    onSubmit(toRecipeInput(values));
  }

  /** The bottom banner. Errors with a place in the form are also shown there. */
  function serverMessage() {
    if (!error) return null;
    if (yieldConflict) {
      return (
        <>
          Nie można usunąć ani zmienić rodzaju wydajności, bo te przepisy używają „{recipe?.name}” w gramach lub
          mililitrach: <RecipeLinks recipes={yieldConflict} />. Zmień tam jednostkę na porcje albo zachowaj wydajność.
        </>
      );
    }
    if (Object.keys(rowMessages).length > 0) return 'Nie udało się zapisać — popraw zaznaczone składniki.';
    return errorMessage(error);
  }

  return (
    <>
      <form className={styles.form} onSubmit={submit} noValidate>
        <Card title="Podstawowe informacje">
          <Field label="Nazwa przepisu" htmlFor={`${id}-name`} error={visible.name}>
            <Input
              id={`${id}-name`}
              placeholder="np. Tort urodzinowy"
              value={values.name}
              onChange={(e) => set('name', e.target.value)}
              invalid={!!visible.name}
              maxLength={200}
              autoFocus
            />
          </Field>
          <div className={styles.basicGrid}>
            <Field label="Liczba porcji" htmlFor={`${id}-portions`} error={visible.portions}>
              <StepperInput
                id={`${id}-portions`}
                inputMode="numeric"
                value={values.portions}
                onChange={(portions) => set('portions', portions)}
                decreaseLabel="Mniej porcji"
                increaseLabel="Więcej porcji"
                invalid={!!visible.portions}
              />
            </Field>
            <Field
              label="Wydajność"
              htmlFor={`${id}-yield`}
              error={visible.yield ?? (yieldConflict ? 'Używany w gramach lub ml w innych przepisach — patrz niżej.' : undefined)}
              hint="ile waży cały przepis — pozwala użyć go w gramach w innych przepisach"
            >
              <div className={styles.yieldInputs}>
                <NumberInput
                  id={`${id}-yield`}
                  placeholder="np. 550"
                  value={values.yieldQuantity}
                  onChange={(e) => set('yieldQuantity', e.target.value)}
                  invalid={!!visible.yield || !!yieldConflict}
                />
                <Select
                  aria-label="Jednostka wydajności"
                  value={values.yieldUnit}
                  onChange={(e) => set('yieldUnit', e.target.value as YieldUnit | '')}
                  invalid={!!visible.yield || !!yieldConflict}
                >
                  <option value="">—</option>
                  {YIELD_UNITS.map((unit) => (
                    <option key={unit} value={unit}>
                      {unitLabel(unit)}
                    </option>
                  ))}
                </Select>
              </div>
            </Field>
            <Field
              label="Cena sprzedaży (zł)"
              htmlFor={`${id}-sell-price`}
              error={visible.sellPrice}
              hint={
                // No price yet: suggest one (30% food cost) once the ingredients give a cost.
                values.sellPrice.trim() === '' && total > 0 ? (
                  <span className={styles.priceSuggestion}>
                    Sugerowana: <strong>{formatMoney(suggestedPrice(total))}</strong> (FC {TARGET_FOOD_COST}%)
                    <span className={styles.suggestionActions}>
                      <button
                        type="button"
                        className={styles.inlineAction}
                        onClick={() => set('sellPrice', toInputValue(suggestedPrice(total)))}
                      >
                        Użyj
                      </button>
                      {recipe && (
                        <>
                          {' · '}
                          <a
                            href={`/calculator/${recipe.id}`}
                            target="_blank"
                            rel="noopener"
                            className={styles.inlineAction}
                            title="Otwiera kalkulator w nowej karcie (zapisana wersja przepisu)"
                          >
                            Kalkulator ↗
                          </a>
                        </>
                      )}
                    </span>
                  </span>
                ) : (
                  'za cały przepis, opcjonalnie'
                )
              }
            >
              <NumberInput
                id={`${id}-sell-price`}
                placeholder="np. 45,00"
                value={values.sellPrice}
                onChange={(e) => set('sellPrice', e.target.value)}
                invalid={!!visible.sellPrice}
              />
            </Field>
          </div>
          <Field label="Opis" htmlFor={`${id}-description`} error={visible.description} className={styles.description}>
            <Input
              id={`${id}-description`}
              placeholder="opcjonalnie, np. na tortownicę 24 cm"
              value={values.description}
              onChange={(e) => set('description', e.target.value)}
              invalid={!!visible.description}
            />
          </Field>
        </Card>

        {/* Live: updates as the price or the ingredients change. */}
        <PriceAlert
          foodCost={total}
          sellPrice={sellPrice}
          portions={portions > 0 ? portions : 1}
          actions={
            <>
              <Button small onClick={() => set('sellPrice', toInputValue(suggestedPrice(total)))}>
                Użyj {formatMoney(suggestedPrice(total))}
              </Button>
              {/* A new tab, so the unsaved edits here aren't lost. */}
              {recipe && (
                <a
                  href={`/calculator/${recipe.id}`}
                  target="_blank"
                  rel="noopener"
                  className={alertStyles.link}
                  title="Kalkulator pokazuje zapisaną wersję przepisu"
                >
                  Otwórz w kalkulatorze ↗
                </a>
              )}
            </>
          }
        />

        <Card
          title="Składniki"
          actions={<PillButton onClick={() => setNewProduct({ rowKey: null, name: '' })}>+ Nowy składnik</PillButton>}
        >
          {values.ingredients.length === 0 && (
            <div className={styles.emptyRows}>
              {products.length === 0
                ? 'Nie masz jeszcze składników — dodaj pierwszy przyciskiem „+ Nowy składnik”.'
                : 'Brak składników — dodaj pierwszy poniżej.'}
            </div>
          )}
          <div className={styles.rows}>
            {values.ingredients.map((row, index) => {
              const ref = rowRef(row);
              const product = row.kind === 'product' && row.productId !== null ? catalog.products.get(row.productId) : undefined;
              const subRecipe = row.kind === 'recipe' && row.recipeId !== null ? catalog.recipes.get(row.recipeId) : undefined;
              const picked = product ?? subRecipe;
              const rowErrors = visible.rows[row.key];
              const cost = rowCost(row, catalog);
              const units: IngredientUnit[] = product
                ? compatibleUnits(product.packageUnit)
                : subRecipe
                  ? subRecipeUnits(subRecipe)
                  : [row.unit];
              // The server's message for this row, until the row is changed.
              const sent = submittedRows.get(row.key);
              const rowMessage =
                sent && rowRef(sent) === ref && sent.unit === row.unit && sent.quantity === row.quantity
                  ? rowMessages[row.key]
                  : undefined;
              const setQuantity = (quantity: string) => updateRow(row.key, (r) => ({ ...r, quantity }));
              const quantityProps = {
                compact: true,
                id: quantityId(row.key),
                'aria-label': `Ilość, składnik ${index + 1}`,
                placeholder: 'ilość',
                value: row.quantity,
                invalid: rowErrors?.quantity || !!rowMessage,
              };
              // Ingredients in other rows get a "już w przepisie" tag in this row's search.
              const inOtherRows = new Set(usedRefs.filter((used, i) => i !== index && used !== null));
              const rowOptions = options.map((option) =>
                inOtherRows.has(option.value) ? { ...option, badge: 'już w przepisie' } : option,
              );
              const isDuplicateTarget = duplicateKey === row.key;
              return (
                <Fragment key={row.key}>
                  <div className={cx(styles.ingredientRow, isDuplicateTarget && styles.flash)}>
                    <div className={styles.product}>
                      <SearchSelect
                        aria-label={`Składnik ${index + 1}`}
                        placeholder="Wyszukaj składnik lub przepis…"
                        options={rowOptions}
                        value={ref}
                        invalid={rowErrors?.product}
                        autoFocus={row.key === focusKey}
                        onChange={(value) => pickIngredient(row.key, value)}
                        createLabel={(query) => `+ Dodaj nowy składnik „${query}”`}
                        createGroup={options.some((option) => option.group) ? PRODUCTS_GROUP : undefined}
                        onCreate={(query) => setNewProduct({ rowKey: row.key, name: query })}
                      />
                    </div>
                    <div className={styles.quantity}>
                      {/* Ingredients counted in pieces (eggs, vanilla pods) or portions get − / + buttons. */}
                      {picked && (row.unit === 'piece' || row.unit === 'portion') ? (
                        <StepperInput
                          {...quantityProps}
                          onChange={setQuantity}
                          decreaseLabel={`Mniej, składnik ${index + 1}`}
                          increaseLabel={`Więcej, składnik ${index + 1}`}
                        />
                      ) : (
                        <NumberInput {...quantityProps} onChange={(e) => setQuantity(e.target.value)} />
                      )}
                    </div>
                    <div className={styles.unit}>
                      <Select
                        compact
                        aria-label={`Jednostka, składnik ${index + 1}`}
                        value={row.unit}
                        disabled={!picked}
                        invalid={rowErrors?.unit || !!rowMessage}
                        onChange={(e) => updateRow(row.key, (r) => ({ ...r, unit: e.target.value as IngredientUnit }))}
                      >
                        {units.map((unit) => (
                          <option key={unit} value={unit}>
                            {unitLabel(unit)}
                          </option>
                        ))}
                      </Select>
                    </div>
                    <div className={cx(styles.cost, cost === null && styles.costEmpty)}>
                      {cost === null ? '—' : formatMoney(cost)}
                    </div>
                    <div className={styles.remove}>
                      <RemoveButton
                        label="Usuń składnik"
                        onClick={() => set('ingredients', values.ingredients.filter((r) => r.key !== row.key))}
                      />
                    </div>
                    {/* Floats under the row, so it doesn't push the other rows down. */}
                    {isDuplicateTarget && (
                      <div className={styles.duplicateNote} role="status">
                        {row.kind === 'recipe' ? 'Przepis' : 'Produkt'}, który wybrałeś, jest już w przepisie.
                      </div>
                    )}
                    {rowMessage ? (
                      <div className={cx(styles.rowNote, styles.rowNoteError)}>{rowMessage}</div>
                    ) : (
                      // Without a yield, a sub-recipe can only be measured in portions.
                      subRecipe &&
                      !subRecipe.yieldUnit && (
                        <div className={styles.rowNote}>
                          Przepis bez wydajności — tylko w porcjach.{' '}
                          <Link
                            to={`/recipes/${subRecipe.id}/edit`}
                            target="_blank"
                            className={styles.inlineAction}
                            title="Otwiera edycję w nowej karcie, ten formularz zostaje"
                          >
                            Ustaw wydajność ↗
                          </Link>
                        </div>
                      )
                    )}
                  </div>
                </Fragment>
              );
            })}
          </div>
          {/* At the bottom, where the next row appears. */}
          <button type="button" className={styles.addLink} onClick={addRow}>
            + Dodaj składnik
          </button>
          {visible.ingredients && <div className={styles.error}>{visible.ingredients}</div>}
        </Card>

        <Card title="Sposób przygotowania" actions={<PillButton onClick={addStep}>+ Dodaj krok</PillButton>}>
          {values.steps.length === 0 && (
            <div className={styles.emptyRows}>Opcjonalnie — opisz kolejne kroki przygotowania.</div>
          )}
          <ol className={styles.rows}>
            {values.steps.map((step, index) => (
              <li key={step.key} className={styles.stepRow}>
                <span className={styles.stepNumber} aria-hidden="true">
                  {index + 1}
                </span>
                <TextArea
                  rows={2}
                  aria-label={`Krok ${index + 1}`}
                  placeholder="Opisz ten krok…"
                  value={step.text}
                  autoFocus={step.key === focusKey}
                  onChange={(e) =>
                    set(
                      'steps',
                      values.steps.map((s) => (s.key === step.key ? { ...s, text: e.target.value } : s)),
                    )
                  }
                />
                <RemoveButton
                  label="Usuń krok"
                  onClick={() => set('steps', values.steps.filter((s) => s.key !== step.key))}
                />
              </li>
            ))}
          </ol>
          {visible.steps && <div className={styles.error}>{visible.steps}</div>}
           <button type="button" className={styles.addLink} onClick={addStep}>
            + Dodaj krok
          </button>
        </Card>

        {total > 0 && (
          <Card accent className={styles.preview}>
            <div>
              <Eyebrow>Podgląd kosztów</Eyebrow>
              <div className={styles.previewValue}>{formatMoney(total)}</div>
            </div>
            <div className={styles.previewSide}>
              {portions > 0 && <div>{formatMoney(total / portions)} / porcja</div>}
              {/* With a price: how profitable it is, worked out live. */}
              {sellPrice !== null && sellPrice > 0 && (
                <div className={styles.previewFoodCost}>
                  <FoodCostBadge foodCost={total} sellPrice={sellPrice} withLabel />
                  {profitability(total, sellPrice)?.needsAttention && (
                    <span className={styles.previewHint}>sugerowana cena {formatMoney(suggestedPrice(total))}</span>
                  )}
                </div>
              )}
            </div>
          </Card>
        )}

        {error && <Banner>{serverMessage()}</Banner>}

        <div className={styles.actions}>
          <Button variant="ghost" onClick={onCancel} className={styles.cancel}>
            Anuluj
          </Button>
          <Button type="submit" dimmed={hasErrors(errors)} disabled={busy} className={styles.submit}>
            {busy ? 'Zapisywanie…' : 'Zapisz przepis'}
          </Button>
        </div>
      </form>

      {/* Outside the <form>: React events bubble through portals, so a nested submit would also save the recipe. */}
      {newProduct && (
        <NewProductModal
          initialName={newProduct.name}
          onCreated={(product) => addCreatedProduct(product, newProduct.rowKey)}
          onClose={() => setNewProduct(null)}
        />
      )}
    </>
  );
}

interface NewProductModalProps {
  initialName: string;
  onCreated: (product: Product) => void;
  onClose: () => void;
}

// Creates the product right away (POST /products), so it is ready even if the recipe is not saved.
function NewProductModal({ initialName, onCreated, onClose }: NewProductModalProps) {
  const create = useCreateProduct();
  const toast = useToast();

  return (
    <Modal size="large" title="Nowy składnik" onClose={onClose}>
      <ProductForm
        initialName={initialName}
        busy={create.isPending}
        serverError={create.error ? errorMessage(create.error) : undefined}
        onCancel={onClose}
        onSubmit={(values) =>
          create.mutate(toProductInput(values), {
            onSuccess: (product) => {
              toast(`Dodano składnik „${product.name}” do biblioteki.`);
              onCreated(product);
            },
          })
        }
      />
    </Modal>
  );
}
