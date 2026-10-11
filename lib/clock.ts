/** Server-side wall clock reads, kept out of component bodies so render stays lint-clean and pure. */
export function serverNowMs(): number {
  return Date.now();
}
