let override: unknown = null;

export function setPortalAdminForTest(admin: unknown) {
  override = admin;
}

export function resolvePortalAdmin<T>(create: () => T): T {
  if (override) return override as T;
  return create();
}
