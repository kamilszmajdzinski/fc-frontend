import type { Product } from '../../api/types';
import { formatMoney, formatQuantity, plural } from '../../lib/format';
import { unitLabel } from '../../lib/units';

/** "200 g" */
export function packageLabel(product: Pick<Product, 'packageSize' | 'packageUnit'>): string {
  return `${formatQuantity(product.packageSize)} ${unitLabel(product.packageUnit)}`;
}

/** "40,00 zł/kg" */
export function unitPriceLabel(product: Pick<Product, 'pricePerUnit' | 'pricingUnit'>): string {
  return `${formatMoney(product.pricePerUnit)}/${unitLabel(product.pricingUnit)}`;
}

/** "1 przepisu", "3 przepisów": after "koszt" the noun is in the genitive. */
export function recipesGenitive(count: number): string {
  return `${count} ${plural(count, 'przepisu', 'przepisów', 'przepisów')}`;
}
