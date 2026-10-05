export function portalClientQuotes<T extends { status: string }>(quotes: T[]): T[] {
  return quotes.filter((quote) => quote.status !== 'draft');
}
