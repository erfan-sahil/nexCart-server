import type { ATTRIBUTE_ROLES, ATTRIBUTE_TYPES } from '../constants/attribute';

export type AttributeType = (typeof ATTRIBUTE_TYPES)[number];

export type AttributeRole = (typeof ATTRIBUTE_ROLES)[number];

export type AttributeValueMode = 'open' | 'choice';

export type AttributeOptionDto = {
  id: string;
  label: string;
  value: string;
  sortOrder: number;
  isActive: boolean;
};

export type AttributeDto = {
  id: string;
  name: string;
  slug: string;
  description: string;
  type: AttributeType;
  role: AttributeRole;
  valueMode: AttributeValueMode;
  unit: string;
  isFilterable: boolean;
  isActive: boolean;
  options: AttributeOptionDto[];
  createdAt: string;
  updatedAt: string;
};

export type CategoryAttributeDto = {
  id: string;
  sourceCategoryId: string;
  inherited: boolean;
  isRequired: boolean;
  isFilterable: boolean;
  sortOrder: number;
  attribute: AttributeDto;
};
