export function nextAssignedTeam(current: string[], memberId: string): string[] {
  return current.includes(memberId)
    ? current.filter(id => id !== memberId)
    : [...current, memberId];
}

export function crewAssignmentHelper(
  assignedIds: string[],
  teamMembers: { id: string; name: string }[],
): string {
  if (assignedIds.length === 0) {
    return 'Unassigned — still on the board when a date is set.';
  }
  const names = assignedIds
    .map(id => teamMembers.find(m => m.id === id)?.name)
    .filter((name): name is string => !!name);
  return names.length > 0 ? names.join(' · ') : 'Crew assigned';
}
