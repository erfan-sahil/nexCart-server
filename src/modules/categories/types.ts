import type { CATEGORY_LEVELS } from './constants';

export type CategoryLevel = (typeof CATEGORY_LEVELS)[number];

export type CategoryDto = {
  id: string;
  name: string;
  slug: string;
  description: string;
  image: string;
  parentId: string | null;
  ancestors: string[];
  level: CategoryLevel;
  isActive: boolean;
  sortOrder: number;
  isFeatured: boolean;
  featuredOrder: number;
  createdAt: string;
  updatedAt: string;
};

export type FeaturedCategoryDto = CategoryDto & {
  productCount: number;
};

export type CategoryBreadcrumb = {
  id: string;
  name: string;
  slug: string;
  level: CategoryLevel;
};

export type CategoryDetailDto = CategoryDto & {
  breadcrumb: CategoryBreadcrumb[];
};

export type CategoryTreeNode = CategoryDto & {
  children: CategoryTreeNode[];
  productCount: number;
};
