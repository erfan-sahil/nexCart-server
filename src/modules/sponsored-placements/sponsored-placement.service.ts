import { DEFAULT_SPONSORED_CTA, DEFAULT_SPONSORED_EYEBROW, SPONSORED_SLOTS } from './constants';
import { SponsoredPlacementModel } from './sponsored-placement.model';
import type {
  SponsoredPlacementManageDto,
  SponsoredPromoDto,
  SponsoredSection,
  SponsoredSlot,
} from './types';
import { AppError } from '../../common/errors/AppError';
import { ProductModel } from '../products/product.model';
import { StoreModel, isStoreListed } from '../stores/store.model';
import { productService } from '../products/product.service';
import type { UpsertSponsoredPlacementInput } from './sponsored-placement.validator';

const isListedProduct = (product: {
  status: string;
  isPublished: boolean;
  approvalStatus: string;
}) => product.approvalStatus === 'approved' && product.status === 'active' && product.isPublished;

const ensureSlots = async () => {
  await Promise.all(
    SPONSORED_SLOTS.map((slot) =>
      SponsoredPlacementModel.updateOne({ slot }, { $setOnInsert: { slot } }, { upsert: true }),
    ),
  );
};

const emptyManage = (slot: SponsoredSlot): SponsoredPlacementManageDto => ({
  slot,
  productId: null,
  productName: '',
  section: null,
  title: '',
  subtitle: '',
  ctaLabel: '',
  image: '',
  isActive: false,
});

export const sponsoredPlacementService = {
  async listManage(): Promise<SponsoredPlacementManageDto[]> {
    await ensureSlots();
    const rows = await SponsoredPlacementModel.find().sort({ slot: 1 }).lean();
    const productIds = rows.flatMap((row) => (row.productId ? [row.productId] : []));
    const products = await ProductModel.find({ _id: { $in: productIds } })
      .select('name')
      .lean();
    const names = new Map(products.map((product) => [String(product._id), product.name]));

    return SPONSORED_SLOTS.map((slot) => {
      const row = rows.find((entry) => entry.slot === slot);

      if (!row) {
        return emptyManage(slot);
      }

      return {
        slot,
        productId: row.productId ? String(row.productId) : null,
        productName: row.productId ? (names.get(String(row.productId)) ?? '') : '',
        section: (row.section as SponsoredSection | null) ?? null,
        title: row.title ?? '',
        subtitle: row.subtitle ?? '',
        ctaLabel: row.ctaLabel ?? '',
        image: row.image ?? '',
        isActive: row.isActive,
      };
    });
  },

  async upsert(slot: SponsoredSlot, input: UpsertSponsoredPlacementInput) {
    await ensureSlots();

    const product = await ProductModel.findById(input.productId).select(
      'name slug shortDescription storeId status isPublished approvalStatus listing.hasStock images thumbnailId',
    );

    if (!product || !isListedProduct(product)) {
      throw AppError.validation('Choose an approved visible product');
    }

    if (!product.listing?.hasStock) {
      throw AppError.validation('Choose a product that is in stock');
    }

    const store = await StoreModel.findById(product.storeId).select('isActive suspendedAt');

    if (!isStoreListed(store)) {
      throw AppError.validation('Choose a product from an active store');
    }

    const siblings = await SponsoredPlacementModel.find({
      slot: { $ne: slot },
      isActive: true,
    }).lean();

    for (const sibling of siblings) {
      if (sibling.section === input.section && input.isActive) {
        throw AppError.conflict('Another sponsored card already uses this section');
      }
    }

    const row = await SponsoredPlacementModel.findOneAndUpdate(
      { slot },
      {
        productId: product._id,
        section: input.section,
        title: input.title ?? '',
        subtitle: input.subtitle ?? '',
        ctaLabel: input.ctaLabel ?? '',
        image: input.image ?? '',
        isActive: input.isActive,
      },
      { upsert: true, new: true },
    );

    if (!row) {
      throw AppError.internal('Sponsored placement could not be saved');
    }

    return {
      slot,
      productId: String(product._id),
      productName: product.name,
      section: input.section,
      title: row.title,
      subtitle: row.subtitle,
      ctaLabel: row.ctaLabel,
      image: row.image,
      isActive: row.isActive,
    } satisfies SponsoredPlacementManageDto;
  },

  async listPublic(): Promise<SponsoredPromoDto[]> {
    await ensureSlots();
    const rows = await SponsoredPlacementModel.find({ isActive: true }).lean();
    const promos: SponsoredPromoDto[] = [];

    for (const row of rows) {
      if (!row.productId || !row.section) {
        continue;
      }

      const product = await ProductModel.findById(row.productId);

      if (!product || !isListedProduct(product) || !product.listing?.hasStock) {
        continue;
      }

      const store = await StoreModel.findById(product.storeId).select('isActive suspendedAt');

      if (!isStoreListed(store)) {
        continue;
      }

      const [dto] = await productService.presentMany([product]);

      if (!dto) {
        continue;
      }

      const price = dto.offer.minPrice ?? 0;
      const original = dto.offer.minOriginalPrice ?? undefined;

      const thumbnail = dto.thumbnail?.url ?? dto.images[0]?.url ?? '';

      promos.push({
        slot: row.slot,
        section: row.section,
        eyebrow: DEFAULT_SPONSORED_EYEBROW,
        title: row.title.trim() || product.name,
        subtitle: row.subtitle.trim() || product.shortDescription,
        ctaLabel: row.ctaLabel.trim() || DEFAULT_SPONSORED_CTA,
        href: `/products/${product.slug}`,
        image: row.image.trim() || thumbnail,
        productName: product.name,
        price,
        originalPrice: original && original > price ? original : undefined,
      });
    }

    return promos;
  },

  async sectionExclusions(): Promise<Map<SponsoredSection, string>> {
    const map = new Map<SponsoredSection, string>();
    const rows = await SponsoredPlacementModel.find({ isActive: true }).lean();

    for (const row of rows) {
      if (!row.section || !row.productId) {
        continue;
      }

      map.set(row.section, String(row.productId));
    }

    return map;
  },
};
