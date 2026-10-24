import { useId, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { errorMessage } from '../../api/client';
import { usePatchRecipe, useRecipe, useRecipes } from '../../api/recipes';
import type { RecipeSummary } from '../../api/types';
import { EmptyState, LoadError, Loading } from '../../components/EmptyState';
import { Icon } from '../../components/Icon';
import { useToast } from '../../components/Toast';
import { Button, Card, cx, Field, NumberInput, Select } from '../../components/ui';
import {
  FOOD_COST_LEVELS,
  foodCostLevel,
  foodCostPercent,
  suggestedPrice,
  TARGET_FOOD_COST,
  type FoodCostLevel,
} from '../../lib/foodcost';
import { formatMoney, formatPercent, parseDecimal, portionsLabel, toInputValue } from '../../lib/format';
import { useIdParam } from '../../lib/useIdParam';
import { formatAmount } from '../../lib/units';
import styles from './CalculatorPage.module.css';

export function CalculatorPage() {
  const recipes = useRecipes();
  const paramId = useIdParam('recipeId');

  let body;
  if (recipes.isPending) body = <Loading />;
  else if (recipes.isError) body = <LoadError error={recipes.error} onRetry={() => recipes.refetch()} />;
  else if (recipes.data.length === 0) {
    body = (
      <EmptyState icon="chart" title="Brak przepisów" sub="Dodaj przepis w zakładce Przepisy">
        <Link to="/recipes/new">Dodaj przepis →</Link>
      </EmptyState>
    );
  } else {
    const selected = paramId === undefined ? recipes.data[0] : recipes.data.find((r) => r.id === paramId);
    body = selected ? (
      // A new recipe starts with its own defaults.
      <Calculator key={selected.id} recipes={recipes.data} recipe={selected} />
    ) : (
      <EmptyState icon="info" title="Nie znaleziono przepisu" sub="Mógł zostać usunięty.">
        <Link to="/calculator">Wybierz inny przepis →</Link>
      </EmptyState>
    );
  }

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div className={styles.eyebrow}>Rentowność</div>
        <h1 className={styles.title}>
          Kalkulator <em>foodcost</em>
        </h1>
      </header>
      {body}
    </div>
  );
}

interface CalculatorProps {
  recipes: RecipeSummary[];
  recipe: RecipeSummary;
}

function Calculator({ recipes, recipe }: CalculatorProps) {
  const id = useId();
  const navigate = useNavigate();
  const detail = useRecipe(recipe.id);
  const toast = useToast();
  const patch = usePatchRecipe();
  const savedPriceText = recipe.sellPrice === null ? '' : toInputValue(recipe.sellPrice);
  const [portionsText, setPortionsText] = useState('');
  // Starts from the recipe's saved price; changes stay here until "Zapisz cenę w przepisie".
  const [priceText, setPriceText] = useState(savedPriceText);

  const typedPortions = parseDecimal(portionsText);
  const portions = Number.isInteger(typedPortions) && typedPortions >= 1 ? typedPortions : recipe.portions;
  const typedPrice = parseDecimal(priceText);
  const sellingPrice = typedPrice > 0 ? typedPrice : 0;

  // The saved price is for the recipe's own portions, so it can only be saved from there.
  const defaultPortions = portions === recipe.portions;
  const priceChanged = sellingPrice > 0 && sellingPrice !== recipe.sellPrice;

  function savePrice() {
    patch.mutate(
      { id: recipe.id, patch: { sellPrice: sellingPrice } },
      {
        onSuccess: (saved) => toast(`Zapisano cenę sprzedaży ${formatMoney(sellingPrice)} w „${saved.name}”.`),
        onError: (error) => toast(errorMessage(error), 'error'),
      },
    );
  }

  const scale = portions / recipe.portions;
  const cost = recipe.foodCost * scale;
  const costPerPortion = cost / portions;
  const percent = foodCostPercent(cost, sellingPrice);
  const level = percent === null ? null : foodCostLevel(percent);
  const profit = sellingPrice > 0 ? sellingPrice - cost : null;
  const suggested = suggestedPrice(cost);

  return (
    <div className={styles.grid}>
      <div className={styles.column}>
        <Card title="Wybierz przepis" className={styles.card}>
          <Select
            aria-label="Przepis"
            value={recipe.id}
            onChange={(e) => navigate(`/calculator/${e.target.value}`, { replace: true })}
          >
            {recipes.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </Select>
          <div className={styles.defaults}>
            Domyślnie: {portionsLabel(recipe.portions)}
            {recipe.sellPrice !== null && ` · cena ${formatMoney(recipe.sellPrice)}`} ·{' '}
            <Link to={`/recipes/${recipe.id}`}>otwórz przepis</Link>
          </div>
        </Card>

        <Card title="Parametry" className={styles.card}>
          <div className={styles.params}>
            <Field label="Liczba porcji" htmlFor={`${id}-portions`}>
              <NumberInput
                id={`${id}-portions`}
                inputMode="numeric"
                placeholder={String(recipe.portions)}
                value={portionsText}
                onChange={(e) => setPortionsText(e.target.value)}
              />
            </Field>
            <Field label="Cena sprzedaży całości (zł)" htmlFor={`${id}-price`}>
              <NumberInput
                id={`${id}-price`}
                placeholder="wpisz cenę"
                value={priceText}
                onChange={(e) => setPriceText(e.target.value)}
              />
            </Field>
            {priceChanged &&
              (defaultPortions ? (
                <Button small onClick={savePrice} disabled={patch.isPending}>
                  {patch.isPending ? 'Zapisywanie…' : `Zapisz cenę ${formatMoney(sellingPrice)} w przepisie`}
                </Button>
              ) : (
                <div className={styles.muted}>
                  Cenę można zapisać w przepisie dla domyślnej liczby porcji ({recipe.portions}).
                </div>
              ))}
            {(portionsText || priceText !== savedPriceText) && (
              <button
                type="button"
                className={styles.reset}
                onClick={() => {
                  setPortionsText('');
                  setPriceText(savedPriceText);
                }}
              >
                ↺ Przywróć domyślne
              </button>
            )}
          </div>
        </Card>

        <Card title="Składniki przepisu" className={styles.card}>
          {detail.isPending ? (
            <div className={styles.muted}>Wczytywanie…</div>
          ) : detail.isError ? (
            <div className={styles.muted}>Nie udało się wczytać składników.</div>
          ) : detail.data.ingredients.length === 0 ? (
            <div className={styles.muted}>Ten przepis nie ma jeszcze składników.</div>
          ) : (
            detail.data.ingredients.map((line, index) => (
              <div key={index} className={styles.ingredient}>
                <span className={styles.ingredientName}>
                  {formatAmount(line.quantity * scale, line.unit)} {line.name}
                </span>
                <span className={styles.ingredientCost}>{formatMoney(line.cost * scale)}</span>
              </div>
            ))
          )}
        </Card>
      </div>

      <div className={styles.column}>
        {percent !== null && level !== null ? (
          <FoodCostGauge percent={percent} level={level} />
        ) : (
          <div className={styles.placeholder}>
            <Icon name="info" size={24} />
            <span>Wpisz cenę sprzedaży, aby obliczyć foodcost i zysk</span>
          </div>
        )}

        <Card title="Zestawienie" className={styles.card}>
          <SummaryRow label="Koszt składników" value={formatMoney(cost)} bold />
          <SummaryRow label={`Koszt / porcja (${portionsLabel(portions)})`} value={formatMoney(costPerPortion)} />
          {sellingPrice > 0 && <SummaryRow label="Przychód ze sprzedaży" value={formatMoney(sellingPrice)} />}
          {profit !== null && (
            <>
              <SummaryRow label="Zysk całkowity" value={formatMoney(profit)} bold tone={profit >= 0 ? 'green' : 'red'} />
              <SummaryRow label="Zysk / porcja" value={formatMoney(profit / portions)} tone={profit >= 0 ? 'green' : 'red'} />
            </>
          )}
        </Card>

        {level === 'good' ? (
          <div className={styles.success}>
            <Icon name="check" size={24} />
            <span>Świetny wynik! Twoja cena zapewnia rentowność przy foodcost poniżej {TARGET_FOOD_COST}%.</span>
          </div>
        ) : (
          cost > 0 && (
            <div className={cx(styles.suggested, level === null && styles.suggestedNeutral)}>
              <div>
                <div className={styles.suggestedLabel}>Sugerowana cena (FC = {TARGET_FOOD_COST}%)</div>
                <div className={styles.suggestedValue}>{formatMoney(suggested)}</div>
                <button type="button" className={styles.reset} onClick={() => setPriceText(toInputValue(suggested))}>
                  Użyj tej ceny
                </button>
              </div>
              <div className={styles.suggestedSide}>
                {formatMoney(suggested / portions)}
                <br />
                <span>/ porcja</span>
              </div>
            </div>
          )
        )}
      </div>
    </div>
  );
}

const GAUGE_MARKS = [0, 30, 40, 100];

function FoodCostGauge({ percent, level }: { percent: number; level: FoodCostLevel }) {
  const info = FOOD_COST_LEVELS[level];
  return (
    <div className={cx(styles.gauge, styles[level])}>
      <div className={styles.gaugeMain}>
        <div className={styles.gaugeLabel}>Foodcost</div>
        <div className={styles.gaugeValue}>{formatPercent(percent)}</div>
        <div className={styles.scale}>
          <div className={styles.marks} aria-hidden="true">
            {GAUGE_MARKS.map((mark) => (
              <span key={mark} style={{ left: `${mark}%` }}>
                {mark}%
              </span>
            ))}
          </div>
          <div className={styles.track}>
            <div className={styles.fill} style={{ width: `${Math.min(percent, 100)}%` }} />
          </div>
        </div>
      </div>
      <div className={styles.gaugeSide}>
        <div className={styles.levelLabel}>{info.label}</div>
        <div className={styles.levelTip}>{info.tip}</div>
        <div className={styles.target}>cel: ≤ {TARGET_FOOD_COST}%</div>
      </div>
    </div>
  );
}

interface SummaryRowProps {
  label: string;
  value: string;
  bold?: boolean;
  tone?: 'green' | 'red';
}

function SummaryRow({ label, value, bold, tone }: SummaryRowProps) {
  return (
    <div className={styles.row}>
      <span className={styles.rowLabel}>{label}</span>
      <span className={cx(styles.rowValue, bold && styles.rowBold, tone && styles[tone])}>{value}</span>
    </div>
  );
}
