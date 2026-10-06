import { isCompanyOwner } from './teamAdminLock';

export type ExpenseCostModelFkUpdate = {
  expense_cost_model_id: string | null;
};

/** Owners and company admins may set profiles.expense_cost_model_id on team members. */
export function canEditTeamMemberExpenseCostModel(args: {
  actorId: string | undefined;
  actorRole: string | undefined | null;
  ownerId: string | null | undefined;
}): boolean {
  if (!args.actorId) return false;
  if (args.actorRole === 'admin') return true;
  return isCompanyOwner(args.actorId, args.ownerId);
}

export function profileExpenseCostModelUpdatePayload(selectedModelId: string): ExpenseCostModelFkUpdate {
  const trimmed = selectedModelId.trim();
  return { expense_cost_model_id: trimmed ? trimmed : null };
}
