import { AttributeModel } from '../modules/attributes/attribute.model';
import { attributeService } from '../modules/attributes/attribute.service';
import { CategoryModel } from '../modules/categories/category.model';
import { logger } from '../common/utils/logger';
import {
  CATEGORY_VARIANT_AXES,
  optionLabelsFor,
  optionValueSlug,
  VARIANT_ATTRIBUTE_DEFS,
  type VariantAttributeKey,
} from './variantSeed';

async function ensureVariantAttribute(key: VariantAttributeKey) {
  const def = VARIANT_ATTRIBUTE_DEFS[key];
  let attribute = await AttributeModel.findOne({ slug: def.slug });

  if (!attribute) {
    attribute = await AttributeModel.create({
      name: def.name,
      slug: def.slug,
      description: def.description,
      type: 'select',
      role: 'variant',
      unit: '',
      isFilterable: true,
      isActive: true,
    });
    return String(attribute._id);
  }

  attribute.name = def.name;
  attribute.description = def.description;
  attribute.type = 'select';
  attribute.role = 'variant';
  attribute.unit = '';
  attribute.isActive = true;
  await attribute.save();

  return String(attribute._id);
}

export async function ensureVariantCatalog() {
  const attributeIds = new Map<string, string>();

  for (const key of Object.keys(VARIANT_ATTRIBUTE_DEFS) as VariantAttributeKey[]) {
    const id = await ensureVariantAttribute(key);
    attributeIds.set(VARIANT_ATTRIBUTE_DEFS[key].slug, id);
  }

  let categories = 0;

  for (const [categorySlug, axes] of Object.entries(CATEGORY_VARIANT_AXES)) {
    const category = await CategoryModel.findOne({ slug: categorySlug }).select('_id');

    if (!category) {
      logger.warn('Skipping variant assignment; category missing', { categorySlug });
      continue;
    }

    const attributes = axes.map((axis, sortOrder) => {
      const def = VARIANT_ATTRIBUTE_DEFS[axis];
      const attributeId = attributeIds.get(def.slug);

      if (!attributeId) {
        throw new Error(`Variant attribute ${def.slug} was not created`);
      }

      return {
        attributeId,
        sortOrder,
        isRequired: true,
        isFilterable: true,
        options: optionLabelsFor(axis).map((label, index) => ({
          label,
          value: optionValueSlug(label),
          sortOrder: index,
          isActive: true,
        })),
      };
    });

    await attributeService.replaceForCategory(String(category._id), { attributes });
    categories += 1;
  }

  logger.info('Variant catalog ready', {
    attributes: attributeIds.size,
    categories,
  });
}
