import { slugify } from '../common/utils/slugify';
import type { CategoryAttributeDto } from '../modules/attributes/types';
import type { VariantAttributeInput } from '../modules/products/variant-attributes';
import type { ProductSeed, ProductVariantSeed } from './productSeed';

export type VariantAttributeKey = 'color' | 'size' | 'storage';

const OPTION_LABELS: Record<VariantAttributeKey, string[]> = {
  color: ['Black', 'White', 'Silver', 'Navy', 'Blue', 'Red', 'Green', 'Gold'],
  size: ['XS', 'S', 'M', 'L', 'XL'],
  storage: ['128 GB', '256 GB', '512 GB', '1 TB'],
};

export const VARIANT_ATTRIBUTE_DEFS: Record<
  VariantAttributeKey,
  { name: string; slug: string; description: string }
> = {
  color: {
    name: 'Color',
    slug: 'color',
    description: 'Product color',
  },
  size: {
    name: 'Size',
    slug: 'size',
    description: 'Apparel size',
  },
  storage: {
    name: 'Storage',
    slug: 'storage',
    description: 'Built-in storage capacity',
  },
};

/** Category slugs that sell with these variant axes (in order). */
export const CATEGORY_VARIANT_AXES: Record<string, VariantAttributeKey[]> = {
  'android-phones': ['color', 'storage'],
  iphones: ['color', 'storage'],
  laptops: ['color', 'storage'],
  headphones: ['color'],
  cameras: ['color'],
  dresses: ['color', 'size'],
  outerwear: ['color', 'size'],
  men: ['color', 'size'],
  shoes: ['color', 'size'],
  bags: ['color'],
  makeup: ['color'],
};

const STORAGE_PRICE_DELTA: Record<string, number> = {
  '128-gb': 0,
  '256-gb': 50,
  '512-gb': 120,
  '1-tb': 220,
};

export function optionLabelsFor(key: VariantAttributeKey) {
  return OPTION_LABELS[key];
}

export function optionValueSlug(label: string) {
  return slugify(label);
}

export function buildVariantAttributeInputs(
  options: Partial<Record<VariantAttributeKey, string>>,
  assignments: CategoryAttributeDto[],
): VariantAttributeInput[] {
  const bySlug = new Map(assignments.map((row) => [row.attribute.slug, row]));

  return Object.entries(options).map(([key, rawValue]) => {
    const assignment = bySlug.get(key);

    if (!assignment || !rawValue) {
      throw new Error(`Unknown variant option ${key}=${rawValue}`);
    }

    const wanted = slugify(rawValue);
    const option = assignment.options.find(
      (entry) => entry.value === wanted || slugify(entry.label) === wanted,
    );

    if (!option) {
      throw new Error(
        `Option "${rawValue}" is not available for ${assignment.attribute.name} on this category`,
      );
    }

    return {
      attributeId: assignment.attribute.id,
      optionIds: [option.id],
    };
  });
}

function splitStock(total: number, count: number) {
  if (count <= 1) {
    return [total];
  }

  const base = Math.max(1, Math.floor(total / count));
  const stocks = Array.from({ length: count }, () => base);
  let remainder = total - base * count;

  for (let index = 0; remainder > 0; index += 1) {
    const slot = stocks[index % count];

    if (slot !== undefined) {
      stocks[index % count] = slot + 1;
    }

    remainder -= 1;
  }

  return stocks;
}

function autoVariantsForElectronics(
  item: ProductSeed,
  axes: VariantAttributeKey[],
): ProductVariantSeed[] {
  const combos: Partial<Record<VariantAttributeKey, string>>[] = [
    { color: 'black', storage: '128-gb' },
    { color: 'black', storage: '256-gb' },
    { color: 'silver', storage: '128-gb' },
    { color: 'silver', storage: '512-gb' },
  ].filter((combo) => axes.every((axis) => combo[axis as keyof typeof combo] !== undefined));

  if (axes.length === 1 && axes[0] === 'color') {
    const colors = ['black', 'white', 'silver'];
    const stocks = splitStock(item.stock, colors.length);

    return colors.map((color, index) => ({
      sku: `NX-${item.slug}-${color}`.toUpperCase().slice(0, 40),
      price: item.price,
      stock: stocks[index] ?? item.stock,
      isDefault: index === 0,
      options: { color },
    }));
  }

  const stocks = splitStock(item.stock, combos.length);

  return combos.map((options, index) => {
    const storageKey = options.storage ?? '128-gb';
    const suffix = `${options.color ?? 'std'}-${storageKey}`.replace(/-/g, '');
    const price = item.price + (STORAGE_PRICE_DELTA[storageKey] ?? 0);

    return {
      sku: `NX-${item.slug}-${suffix}`.toUpperCase().slice(0, 40),
      price,
      stock: stocks[index] ?? 1,
      isDefault: index === 0,
      discountPercent: index === 0 ? item.discountPercent : undefined,
      options,
    };
  });
}

function autoVariantsForApparel(item: ProductSeed): ProductVariantSeed[] {
  const combos: Partial<Record<VariantAttributeKey, string>>[] = [
    { color: 'black', size: 'm' },
    { color: 'black', size: 'l' },
    { color: 'navy', size: 'm' },
    { color: 'navy', size: 'l' },
  ];
  const stocks = splitStock(item.stock, combos.length);

  return combos.map((options, index) => {
    const suffix = `${options.color}-${options.size}`.replace(/-/g, '');

    return {
      sku: `NX-${item.slug}-${suffix}`.toUpperCase().slice(0, 40),
      price: item.price,
      stock: stocks[index] ?? 1,
      isDefault: index === 0,
      options,
    };
  });
}

export function variantsForProduct(item: ProductSeed): ProductVariantSeed[] | null {
  if (item.variants?.length) {
    return item.variants;
  }

  const axes = CATEGORY_VARIANT_AXES[item.categorySlug];

  if (!axes?.length) {
    return null;
  }

  if (axes.includes('size')) {
    return autoVariantsForApparel(item);
  }

  return autoVariantsForElectronics(item, axes);
}
