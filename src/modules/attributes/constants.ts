export const ATTRIBUTE_TYPES = ['text', 'number', 'boolean', 'select', 'multiselect'] as const;

export const ATTRIBUTE_ROLES = ['spec', 'variant'] as const;

export const OPEN_ATTRIBUTE_TYPES = ['text', 'number', 'boolean'] as const;

export const CHOICE_ATTRIBUTE_TYPES = ['select', 'multiselect'] as const;

export const VARIANT_ATTRIBUTE_TYPES = ['text', 'number', 'select'] as const;

export const isChoiceAttributeType = (type: string) => type === 'select' || type === 'multiselect';

export const isVariantAttributeType = (type: string) =>
  type === 'text' || type === 'number' || type === 'select';
