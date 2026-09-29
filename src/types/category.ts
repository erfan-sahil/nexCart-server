import type { CATEGORY_LEVELS } from '../constants/category';

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
  createdAt: string;
  updatedAt: string;
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
};
