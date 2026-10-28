import type { CATALOG_COLLECTIONS, CATALOG_COLLECTION_PARAMS } from '../constants/catalog';
import type { ProductDto } from './product';
import type { PublicStoreSummaryDto } from './store';

export type CatalogCollection = (typeof CATALOG_COLLECTIONS)[number];

export type CatalogCollectionParam = (typeof CATALOG_COLLECTION_PARAMS)[number];

export type CatalogProductSection = {
  items: ProductDto[];
};

export type CatalogFlashSection = CatalogProductSection & {
  endsAt: string | null;
};

export type CatalogHomeDto = {
  flashDeals: CatalogFlashSection;
  topSelling: CatalogProductSection;
  popularStores: {
    items: PublicStoreSummaryDto[];
  };
  trending: CatalogProductSection;
  newArrivals: CatalogProductSection;
};
