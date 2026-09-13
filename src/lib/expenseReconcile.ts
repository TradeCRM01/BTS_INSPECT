/** COGS already pointed at a job still needs a human check against the job bill. */
export function expenseNeedsJobReconcile(expense: {
  cost_class: string;
  job_id: string | null | undefined;
  status: string;
}): boolean {
  if (expense.cost_class !== 'cogs') return false;
  if (!expense.job_id) return false;
  return expense.status === 'recorded' || expense.status === 'paid';
}
