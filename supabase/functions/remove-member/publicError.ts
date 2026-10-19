export const REMOVE_MEMBER_FAILED =
  "Couldn't remove this member. Try again or contact support.";

export function publicRemoveMemberError(_err: unknown): string {
  return REMOVE_MEMBER_FAILED;
}
