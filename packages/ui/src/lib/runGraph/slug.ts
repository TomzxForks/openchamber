export const toRunGraphSlug = (value: string): string =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .substring(0, 50);

export const toRunGraphModelSlug = (providerID: string, modelID: string): string =>
  `${toRunGraphSlug(providerID)}-${toRunGraphSlug(modelID)}`.substring(0, 60);
