export function industryNewsSource(
  author?: string | null,
  creator?: string | null,
): string {
  return author || creator || 'Industry';
}
