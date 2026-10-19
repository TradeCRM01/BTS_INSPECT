export type TemplateAccessLevel = 'view' | 'edit' | 'none';

export type TemplateAccessProfile = {
  role?: string | null;
  template_access?: string | null;
};

export const TEMPLATE_ACCESS_DENIED_TITLE = 'No access';
export const TEMPLATE_ACCESS_DENIED_BODY =
  'Templates are hidden for this account. Ask an admin if you need them.';
export const TEMPLATE_WRITE_NO_ROW =
  'Could not save. The change was not stored.';

export function throwIfNoRows(result: {
  data: unknown;
  error: { message?: string } | null;
}): void {
  if (result.error) {
    throw new Error(result.error.message || TEMPLATE_WRITE_NO_ROW);
  }
  const { data } = result;
  if (data == null) {
    throw new Error(TEMPLATE_WRITE_NO_ROW);
  }
  if (Array.isArray(data) && data.length === 0) {
    throw new Error(TEMPLATE_WRITE_NO_ROW);
  }
}

export function templatesLookDenied(): boolean {
  try {
    return new URLSearchParams(window.location.search).get('look') === 'p331-templates-none';
  } catch {
    return false;
  }
}

export function canViewTemplates(profile: TemplateAccessProfile | null | undefined): boolean {
  if (templatesLookDenied()) return false;
  if (!profile) return false;
  if (profile.role === 'admin') return true;
  return profile.template_access === 'edit' || profile.template_access === 'view';
}

export function canEditTemplates(profile: TemplateAccessProfile | null | undefined): boolean {
  if (!profile) return false;
  if (profile.role === 'admin') return true;
  return profile.template_access === 'edit';
}

export function navItemAllowedForProfile(
  to: string,
  profile: TemplateAccessProfile | null | undefined,
): boolean {
  if (to === '/templates') return canViewTemplates(profile);
  return true;
}
