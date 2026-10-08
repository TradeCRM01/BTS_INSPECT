/** Swallow mutateAsync rejection — mutation onError has already toasted. */
export async function jobBillInvoiceMutateSilentlyOnReject(
  mutateAsync: () => Promise<unknown>,
): Promise<boolean> {
  try {
    await mutateAsync();
    return true;
  } catch {
    return false;
  }
}
