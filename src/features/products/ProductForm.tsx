import { useId, useState, type FormEvent, type ReactNode } from 'react';
import type { Product, Recipe } from '../../api/types';
import { Banner, Button, Card, Eyebrow, Field, Input, NumberInput, Select, TextArea } from '../../components/ui';
import { formatMoney, formatQuantity, formatUnitPrice, parseDecimal, toInputValue } from '../../lib/format';
import { convert, defaultRecipeUnit, PACKAGE_UNITS, unitLabel } from '../../lib/units';
import {
  derivePrices,
  hasPriceChange,
  hasProductChanges,
  initialProductForm,
  priceImpact,
  pricingUnitLabel,
  validateProductForm,
  type PriceImpact,
  type ProductFormValues,
} from './productFormModel';
import { PriceImpactPanel } from './RecipeImpact';
import styles from './ProductForm.module.css';

interface ProductFormProps {
  /** The product being edited. Leave out to create a new one. */
  product?: Product;
  /** Recipes that use the product, to preview how a price change affects them. */
  usedIn?: { recipes: Recipe[]; loading: boolean };
  /** Starting name for a new product, e.g. what the user searched for in the recipe editor. */
  initialName?: string;
  busy: boolean;
  serverError?: ReactNode;
  onSubmit: (values: ProductFormValues, impact: PriceImpact) => void;
  onCancel: () => void;
}

const NO_IMPACT: PriceImpact = { changes: [], conflicts: [] };

export function ProductForm({ product, usedIn, initialName, busy, serverError, onSubmit, onCancel }: ProductFormProps) {
  const id = useId();
  const [values, setValues] = useState(() => {
    const initial = initialProductForm(product);
    return initialName ? { ...initial, name: initialName } : initial;
  });
  const [showErrors, setShowErrors] = useState(false);

  const errors = validateProductForm(values);
  const valid = Object.keys(errors).length === 0;
  const visible = showErrors ? errors : {};
  const prices = derivePrices(values);
  const perUnit = pricingUnitLabel(values.packageUnit);

  // Editing: nothing to save until something differs from the saved product.
  const changed = !product || hasProductChanges(values, product);
  const impact = product && usedIn ? priceImpact(values, product, usedIn.recipes) : NO_IMPACT;
  const checking = !!product && !!usedIn?.loading && hasPriceChange(values, product);
  // A unit change the recipes can't follow would be refused by the API, so it can't be saved.
  const blocked = checking || impact.conflicts.length > 0;

  function set<K extends keyof ProductFormValues>(key: K, value: ProductFormValues[K]) {
    setValues((current) => ({ ...current, [key]: value }));
  }

  // The price the user did not type shows the derived value.
  const packagePriceText =
    values.priceSource === 'package' || !prices ? values.pricePerPackage : toInputValue(prices.pricePerPackage);
  const unitPriceText =
    values.priceSource === 'unit' || !prices ? values.pricePerUnit : toInputValue(prices.pricePerUnit);

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!valid) {
      setShowErrors(true);
      return;
    }
    if (!changed || blocked) return;
    onSubmit(values, impact);
  }

  return (
    <form className={styles.form} onSubmit={submit} noValidate>
      <Card title="Informacje podstawowe">
        <div className={styles.fields}>
          <Field label="Nazwa składnika" htmlFor={`${id}-name`} error={visible.name}>
            <Input
              id={`${id}-name`}
              placeholder="np. Mąka pszenna T550"
              value={values.name}
              onChange={(e) => set('name', e.target.value)}
              invalid={!!visible.name}
              maxLength={200}
              autoFocus
            />
          </Field>

          <Field label="Producent" htmlFor={`${id}-manufacturer`} error={visible.manufacturer}>
            <Input
              id={`${id}-manufacturer`}
              placeholder="opcjonalnie"
              value={values.manufacturer}
              onChange={(e) => set('manufacturer', e.target.value)}
              invalid={!!visible.manufacturer}
              maxLength={200}
            />
          </Field>

          <div className={styles.priceGrid}>
            <Field
              label="Cena opakowania (zł)"
              htmlFor={`${id}-package-price`}
              error={values.priceSource === 'package' ? visible.price : undefined}
            >
              <NumberInput
                id={`${id}-package-price`}
                placeholder="3,49"
                value={packagePriceText}
                onChange={(e) => setValues((v) => ({ ...v, pricePerPackage: e.target.value, priceSource: 'package' }))}
                invalid={values.priceSource === 'package' && !!visible.price}
              />
            </Field>
            <Field label="Ilość w opakowaniu" htmlFor={`${id}-size`} error={visible.packageSize}>
              <NumberInput
                id={`${id}-size`}
                placeholder="1000"
                value={values.packageSize}
                onChange={(e) => set('packageSize', e.target.value)}
                invalid={!!visible.packageSize}
              />
            </Field>
            <Field label="Jednostka" htmlFor={`${id}-unit`}>
              <Select
                id={`${id}-unit`}
                value={values.packageUnit}
                onChange={(e) => set('packageUnit', e.target.value as ProductFormValues['packageUnit'])}
              >
                {PACKAGE_UNITS.map((unit) => (
                  <option key={unit} value={unit}>
                    {unit === 'piece' ? 'szt (sztuki)' : unit}
                  </option>
                ))}
              </Select>
            </Field>
            <Field
              label={`Cena za ${perUnit} (zł)`}
              htmlFor={`${id}-unit-price`}
              error={values.priceSource === 'unit' ? visible.price : undefined}
            >
              <NumberInput
                id={`${id}-unit-price`}
                placeholder="3,49"
                value={unitPriceText}
                onChange={(e) => setValues((v) => ({ ...v, pricePerUnit: e.target.value, priceSource: 'unit' }))}
                invalid={values.priceSource === 'unit' && !!visible.price}
              />
            </Field>
            <p className={styles.priceHint}>
              Wpisz cenę opakowania albo cenę za {perUnit} — druga przeliczy się sama.
            </p>
          </div>

          <Field label="Opis" htmlFor={`${id}-description`} error={visible.description}>
            <TextArea
              id={`${id}-description`}
              rows={2}
              placeholder="opcjonalnie, np. do czego go używasz"
              value={values.description}
              onChange={(e) => set('description', e.target.value)}
              invalid={!!visible.description}
            />
          </Field>
        </div>
      </Card>

      {prices && <UnitCostPreview values={values} pricePerPackage={prices.pricePerPackage} />}

      {product && <PriceImpactPanel impact={impact} checking={checking} />}

      {serverError && <Banner>{serverError}</Banner>}

      <div className={styles.actions}>
        <Button variant="ghost" onClick={onCancel} className={styles.cancel}>
          Anuluj
        </Button>
        <Button
          type="submit"
          dimmed={!valid}
          disabled={busy || !changed || blocked}
          title={changed ? undefined : 'Nic się nie zmieniło'}
          className={styles.submit}
        >
          {busy ? 'Zapisywanie…' : product ? 'Zapisz zmiany' : 'Zapisz składnik'}
        </Button>
      </div>
    </form>
  );
}

// Recipes are weighed in g, ml or pieces, so show what one of those costs.
function UnitCostPreview({ values, pricePerPackage }: { values: ProductFormValues; pricePerPackage: number }) {
  const recipeUnit = defaultRecipeUnit(values.packageUnit);
  const sizeInRecipeUnits = convert(parseDecimal(values.packageSize), values.packageUnit, recipeUnit);
  const costPerRecipeUnit = pricePerPackage / sizeInRecipeUnits;
  const label = unitLabel(recipeUnit);

  return (
    <Card accent className={styles.preview}>
      <div>
        <Eyebrow>Koszt jednostkowy</Eyebrow>
        <div className={styles.previewValue}>{formatUnitPrice(costPerRecipeUnit)}</div>
      </div>
      <div className={styles.previewSide}>
        <div>za 1 {label}</div>
        <div className={styles.previewFormula}>
          {formatQuantity(sizeInRecipeUnits)} {label} × {formatUnitPrice(costPerRecipeUnit)} = {formatMoney(pricePerPackage)}
        </div>
      </div>
    </Card>
  );
}
