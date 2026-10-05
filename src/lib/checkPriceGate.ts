export const CHECK_PRICE_BLOCK = 'Price the Check price lines first';

export type CheckPriceLine = {
  check_price?: boolean | null;
  unit_price?: string | number | null;
};

export function checkPriceAfterUnitPrice(
  unitPrice: string | number,
  checkPrice: boolean,
): boolean {
  return Number(unitPrice) > 0 ? false : !!checkPrice;
}

export function checkPriceSendBlock(
  lines: CheckPriceLine[] | null | undefined,
): string | null {
  const blocked = (lines ?? []).some(line => (
    !!line.check_price && !(Number(line.unit_price) > 0)
  ));
  return blocked ? CHECK_PRICE_BLOCK : null;
}

export function throwIfCheckPriceUnpriced(
  lines: CheckPriceLine[] | null | undefined,
): void {
  const block = checkPriceSendBlock(lines);
  if (block) throw new Error(block);
}
