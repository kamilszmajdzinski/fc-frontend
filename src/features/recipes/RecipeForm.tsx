import { Fragment, useEffect, useId, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { errorMessage } from '../../api/client';
import { useCreateProduct } from '../../api/products';
import type { Product, Recipe, RecipeInput, Unit } from '../../api/types';
import { Modal } from '../../components/Modal';
import { FoodCostBadge } from '../../components/FoodCostBadge';
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
import { formatMoney, toInputValue } from '../../lib/format';
import { compatibleUnits, unitLabel } from '../../lib/units';
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
  toRecipeInput,
  validateRecipeForm,
  withProduct,
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
  busy: boolean;
  serverError?: ReactNode;
  onSubmit: (input: RecipeInput) => void;
  onCancel: () => void;
}

const NO_ERRORS: RecipeFormErrors = { rows: {} };

export function RecipeForm({ recipe, products, busy, serverError, onSubmit, onCancel }: RecipeFormProps) {
  const id = useId();
  const [values, setValues] = useState(() => initialRecipeForm(recipe));
  const [showErrors, setShowErrors] = useState(false);
  // The "new ingredient" dialog: opened from the header (fills the first empty row) or from a row's search.
  const [newProduct, setNewProduct] = useState<{ rowKey: string | null; name: string } | null>(null);
  // Rows added by the user get focus; rows loaded with the recipe do not.
  const [focusKey, setFocusKey] = useState<string | null>(null);

  const productsById = useMemo(() => new Map(products.map((product) => [product.id, product])), [products]);
  const productOptions = useMemo<SearchOption[]>(
    () =>
      products.map((product) => ({
        value: product.id,
        label: product.name,
        meta: [product.manufacturer, packageLabel(product), unitPriceLabel(product)].filter(Boolean).join(' · '),
        keywords: product.manufacturer,
      })),
    [products],
  );
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
  function pickProduct(rowKey: string, productId: number) {
    const picked = productsById.get(productId);
    if (!picked) return;
    const current = values.ingredients.find((row) => row.key === rowKey);
    const existing = values.ingredients.find((row) => row.productId === productId && row.key !== rowKey);
    if (!existing) {
      updateRow(rowKey, (row) => withProduct(row, picked));
      focusQuantity(rowKey);
      return;
    }
    if (current?.productId === null) {
      setValues((form) => ({ ...form, ingredients: form.ingredients.filter((row) => row.key !== rowKey) }));
    }
    focusQuantity(existing.key, true);
    setDuplicateKey(existing.key);
    window.clearTimeout(duplicateTimer.current);
    duplicateTimer.current = window.setTimeout(() => setDuplicateKey(null), 4000);
  }

  // Products used in each row, so the search can tag the ones already in the recipe.
  const usedProductIds = values.ingredients.map((row) => row.productId);
  const errors = validateRecipeForm(values);
  const visible = showErrors ? errors : NO_ERRORS;
  const portions = parsePortions(values.portions);
  const typedSellPrice = parseSellPrice(values.sellPrice);
  const sellPrice = typedSellPrice !== null && Number.isNaN(typedSellPrice) ? null : typedSellPrice;
  const total = previewFoodCost(values, productsById);

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
      values.ingredients.find((row) => row.key === rowKey) ?? values.ingredients.find((row) => row.productId === null);
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
    onSubmit(toRecipeInput(values));
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
            <Field label="Opis" htmlFor={`${id}-description`} error={visible.description}>
              <Input
                id={`${id}-description`}
                placeholder="opcjonalnie, np. na tortownicę 24 cm"
                value={values.description}
                onChange={(e) => set('description', e.target.value)}
                invalid={!!visible.description}
              />
            </Field>
          </div>
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
              const product = row.productId === null ? undefined : productsById.get(row.productId);
              const rowErrors = visible.rows[row.key];
              const cost = rowCost(row, productsById);
              const units: Unit[] = product ? compatibleUnits(product.packageUnit) : [row.unit];
              const setQuantity = (quantity: string) => updateRow(row.key, (r) => ({ ...r, quantity }));
              const quantityProps = {
                compact: true,
                id: quantityId(row.key),
                'aria-label': `Ilość, składnik ${index + 1}`,
                placeholder: 'ilość',
                value: row.quantity,
                invalid: rowErrors?.quantity,
              };
              // Ingredients in other rows get a "już w przepisie" tag in this row's search.
              const inOtherRows = new Set(usedProductIds.filter((productId, i) => i !== index && productId !== null));
              const options = productOptions.map((option) =>
                inOtherRows.has(option.value) ? { ...option, badge: 'już w przepisie' } : option,
              );
              const isDuplicateTarget = duplicateKey === row.key;
              return (
                <Fragment key={row.key}>
                  <div className={cx(styles.ingredientRow, isDuplicateTarget && styles.flash)}>
                    <div className={styles.product}>
                      <SearchSelect
                        aria-label={`Składnik ${index + 1}`}
                        placeholder="Wyszukaj składnik…"
                        options={options}
                        value={row.productId}
                        invalid={rowErrors?.product}
                        autoFocus={row.key === focusKey}
                        onChange={(productId) => pickProduct(row.key, productId)}
                        createLabel={(query) => `+ Dodaj nowy składnik „${query}”`}
                        onCreate={(query) => setNewProduct({ rowKey: row.key, name: query })}
                      />
                    </div>
                    <div className={styles.quantity}>
                      {/* Ingredients counted in pieces (eggs, vanilla pods) get − / + buttons. */}
                      {product && row.unit === 'piece' ? (
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
                        disabled={!product}
                        onChange={(e) => updateRow(row.key, (r) => ({ ...r, unit: e.target.value as Unit }))}
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
                        Produkt, który wybrałeś, jest już w przepisie.
                      </div>
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

        {serverError && <Banner>{serverError}</Banner>}

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
