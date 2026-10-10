import { Fragment, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { errorMessage } from '../../api/client';
import { usePatchRecipe } from '../../api/recipes';
import type { Recipe } from '../../api/types';
import { Icon } from '../../components/Icon';
import { BackLink, DetailPage, PageHeader } from '../../components/MasterDetail';
import { ConfirmModal } from '../../components/Modal';
import { useToast } from '../../components/Toast';
import { Button, Card, cx, Stat, type StatTone } from '../../components/ui';
import { costShares, seriesColor } from '../../lib/costShare';
import {
  FOOD_COST_LEVELS,
  profitability,
  suggestedPrice,
  TARGET_FOOD_COST,
  type FoodCostLevel,
} from '../../lib/foodcost';
import { formatDateTime, formatMoney, formatPercent, formatQuantity, plural, portionsLabel } from '../../lib/format';
import { unitLabel } from '../../lib/units';
import { HistoryCard } from '../history/HistoryCard';
import { RecipeCostTimeline } from './RecipeCostHistory';
import { PriceAlert } from './PriceAlert';
import alertStyles from './PriceAlert.module.css';
import styles from './RecipeDetail.module.css';

const LEVEL_TONES: Record<FoodCostLevel, StatTone> = { good: 'green', acceptable: 'orange', high: 'red' };

interface RecipeDetailProps {
  recipe: Recipe;
  deleting: boolean;
  onDelete: () => void;
}

export function RecipeDetail({ recipe, deleting, onDelete }: RecipeDetailProps) {
  const navigate = useNavigate();
  const toast = useToast();
  const patch = usePatchRecipe();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const count = recipe.ingredients.length;
  const suggested = suggestedPrice(recipe.foodCost);
  const result = profitability(recipe.foodCost, recipe.sellPrice);
  const editUrl = `/recipes/${recipe.id}/edit`;

  function applySuggestedPrice() {
    patch.mutate(
      { id: recipe.id, patch: { sellPrice: suggested } },
      {
        onSuccess: () => toast(`Ustawiono cenę sprzedaży ${formatMoney(suggested)}.`),
        onError: (error) => toast(errorMessage(error), 'error'),
      },
    );
  }

  return (
    <DetailPage>
      <BackLink to="/recipes">Przepisy</BackLink>
      <PageHeader
        large
        eyebrow="Przepis"
        title={recipe.name}
        sub={[
          portionsLabel(recipe.portions),
          recipe.sellPrice !== null ? `cena sprzedaży ${formatMoney(recipe.sellPrice)}` : null,
          `zaktualizowano ${formatDateTime(recipe.updatedAt)}`,
        ]
          .filter(Boolean)
          .join(' · ')}
        actions={
          <>
            <Button variant="ghost" small onClick={() => navigate(`/recipes/${recipe.id}/edit`)}>
              <Icon name="edit" size={14} />
              Edytuj
            </Button>
            <Button variant="danger" small onClick={() => setConfirmOpen(true)} aria-label="Usuń przepis" title="Usuń przepis">
              <Icon name="trash" size={14} />
            </Button>
          </>
        }
      >
        {recipe.description && <p className={styles.description}>{recipe.description}</p>}
      </PageHeader>

      <div className={styles.stats}>
        <Stat
          label="Koszt składników"
          value={formatMoney(recipe.foodCost)}
          sub={`${formatMoney(recipe.costPerPortion)} / porcja · ${count} ${plural(count, 'składnik', 'składniki', 'składników')}`}
        />
        {result ? (
          <>
            <Stat
              label="Foodcost"
              tone={LEVEL_TONES[result.level]}
              value={formatPercent(result.percent)}
              sub={result.loss ? 'Strata · cena poniżej kosztu' : `${FOOD_COST_LEVELS[result.level].label} · ${FOOD_COST_LEVELS[result.level].tip}`}
            />
            <Stat
              label="Zysk"
              value={<span className={result.profit >= 0 ? styles.gain : styles.lossValue}>{formatMoney(result.profit)}</span>}
              sub={`${formatMoney(result.profit / recipe.portions)} / porcja`}
            />
          </>
        ) : (
          <>
            <Stat
              label="Cena sprzedaży"
              value="—"
              sub={
                <>
                  Brak ceny sprzedaży · <Link to={editUrl}>ustaw cenę</Link>
                </>
              }
            />
            <Stat
              label={`Sugerowana cena (FC ${TARGET_FOOD_COST}%)`}
              value={formatMoney(suggested)}
              sub={`${formatMoney(suggested / recipe.portions)} / porcja`}
            />
          </>
        )}
      </div>

      {/* The price no longer reaches the 30% target, e.g. after an ingredient got more expensive. */}
      <PriceAlert
        className={styles.priceAlert}
        foodCost={recipe.foodCost}
        sellPrice={recipe.sellPrice}
        portions={recipe.portions}
        actions={
          <>
            <Button small onClick={applySuggestedPrice} disabled={patch.isPending}>
              {patch.isPending ? 'Zapisywanie…' : `Ustaw ${formatMoney(suggested)}`}
            </Button>
            <Link to={`/calculator/${recipe.id}`} className={alertStyles.link}>
              Otwórz w kalkulatorze →
            </Link>
          </>
        }
      />

      <Card title="Rozkład kosztów" className={styles.section}>
        {count === 0 ? (
          <div className={styles.muted}>
            Brak składników — <Link to={`/recipes/${recipe.id}/edit`}>edytuj przepis</Link>, aby je dodać.
          </div>
        ) : (
          <CostBreakdown recipe={recipe} />
        )}
      </Card>

      {recipe.steps.length > 0 && (
        <Card title="Sposób przygotowania" className={styles.section}>
          <ol className={styles.steps}>
            {recipe.steps.map((step, index) => (
              <li key={index} className={styles.step}>
                <span className={styles.stepNumber} aria-hidden="true">
                  {index + 1}
                </span>
                <span>{step}</span>
              </li>
            ))}
          </ol>
        </Card>
      )}

      <HistoryCard
        type="recipe"
        id={recipe.id}
        numbers={{ label: 'Koszty', content: <RecipeCostTimeline recipeId={recipe.id} /> }}
        className={styles.section}
      />

      <Button variant="accent" className={styles.cta} onClick={() => navigate(`/calculator/${recipe.id}`)}>
        <Icon name="chart" size={16} />
        Otwórz w kalkulatorze →
      </Button>

      {confirmOpen && (
        <ConfirmModal
          message={`Czy na pewno chcesz usunąć przepis „${recipe.name}”?`}
          busy={deleting}
          onConfirm={onDelete}
          onCancel={() => setConfirmOpen(false)}
        />
      )}
    </DetailPage>
  );
}

/**
 * The ingredient table doubles as the bar's legend: each row's swatch is its segment's colour.
 * Hovering or focusing a segment shows its value and highlights its row; hovering a row highlights its segment.
 */
function CostBreakdown({ recipe }: { recipe: Recipe }) {
  const total = recipe.foodCost;
  const { lineSlots, segments } = costShares(
    recipe.ingredients.map((line) => ({ name: line.productName, cost: line.cost })),
    total,
  );
  // Segment key of the highlighted row/segment, and whether the bar is the one being pointed at.
  const [active, setActive] = useState<{ key: string; fromBar: boolean } | null>(null);
  const segmentKeyOf = (index: number) => (lineSlots[index] === 'other' ? 'other' : String(index));

  const tooltip = active?.fromBar ? segments.find((segment) => segment.key === active.key) : undefined;
  let tooltipCenter = 0;
  for (const segment of segments) {
    if (segment === tooltip) {
      tooltipCenter += segment.share / 2;
      break;
    }
    tooltipCenter += segment.share;
  }

  return (
    <>
      <div className={styles.table}>
        <div className={styles.th}>Składnik</div>
        <div className={`${styles.th} ${styles.right}`}>Kwota</div>
        <div className={`${styles.th} ${styles.right}`}>Udział</div>
        {recipe.ingredients.map((line, index) => {
          const key = segmentKeyOf(index);
          const rowProps = {
            onMouseEnter: () => setActive({ key, fromBar: false }),
            onMouseLeave: () => setActive(null),
          };
          // While something is highlighted, the other rows step back.
          const faded = active !== null && active.key !== key;
          return (
            <Fragment key={index}>
              <div className={cx(styles.name, faded && styles.faded)} {...rowProps}>
                <span className={styles.swatch} style={{ background: seriesColor(lineSlots[index]) }} aria-hidden="true" />
                <span className={styles.amount}>
                  {formatQuantity(line.quantity)} {unitLabel(line.unit)}
                </span>{' '}
                <Link to={`/products/${line.productId}`} className={styles.productLink}>
                  {line.productName}
                </Link>
              </div>
              <div className={cx(styles.cost, faded && styles.faded)} {...rowProps}>
                {formatMoney(line.cost)}
              </div>
              <div className={cx(styles.share, faded && styles.faded)} {...rowProps}>
                {formatPercent(total > 0 ? (line.cost / total) * 100 : 0)}
              </div>
            </Fragment>
          );
        })}
      </div>

      {segments.length > 0 && (
        <div className={styles.barWrap}>
          <div className={styles.bar} role="list" aria-label="Udział składników w koszcie przepisu">
            {segments.map((segment) => (
              <div
                key={segment.key}
                role="listitem"
                tabIndex={0}
                aria-label={`${segment.label}: ${formatMoney(segment.cost)}, ${formatPercent(segment.share)}`}
                className={cx(styles.segment, active && active.key !== segment.key && styles.dimmed)}
                style={{ flexGrow: segment.share, background: seriesColor(segment.slot) }}
                onMouseEnter={() => setActive({ key: segment.key, fromBar: true })}
                onMouseLeave={() => setActive(null)}
                onFocus={() => setActive({ key: segment.key, fromBar: true })}
                onBlur={() => setActive(null)}
              />
            ))}
          </div>
          {tooltip && (
            // Kept inside the card near the edges, so it never overflows.
            <div className={styles.tooltip} style={{ left: `${Math.min(Math.max(tooltipCenter, 12), 88)}%` }} aria-hidden="true">
              <div className={styles.tooltipValue}>
                <span className={styles.tooltipKey} style={{ background: seriesColor(tooltip.slot) }} />
                {formatMoney(tooltip.cost)} · {formatPercent(tooltip.share)}
              </div>
              <div className={styles.tooltipLabel}>{tooltip.label}</div>
            </div>
          )}
        </div>
      )}
    </>
  );
}
