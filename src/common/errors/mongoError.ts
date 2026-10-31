export const isDuplicateKeyError = (error: unknown): boolean => {
  if (typeof error !== 'object' || error === null || !('code' in error)) {
    return false;
  }

  return error.code === 11000;
};

export const duplicateKeyFields = (error: unknown): string[] => {
  if (!isDuplicateKeyError(error) || typeof error !== 'object' || error === null) {
    return [];
  }

  if (
    !('keyPattern' in error) ||
    typeof error.keyPattern !== 'object' ||
    error.keyPattern === null
  ) {
    return [];
  }

  return Object.keys(error.keyPattern);
};
