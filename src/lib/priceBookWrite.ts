export function priceBookWritePayload(input: {
  companyId: string;
  name: string;
  description: string;
  isDefault: boolean;
  now?: Date;
}) {
  return {
    company_id: input.companyId,
    name: input.name.trim(),
    description: input.description.trim() || null,
    is_default: input.isDefault,
    updated_at: (input.now ?? new Date()).toISOString(),
  };
}
