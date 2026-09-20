/**
 * A quote and a materials sheet pair up implicitly — one sheet's cost feeds
 * one quote's Estimated Cost — as long as a project has at most one of
 * each. Once it has more than one sheet or more than one quote, that
 * implicit pairing is ambiguous and an explicit link (see
 * LinkedDocumentBar) is required instead. Shared by the Quote builder and
 * Materials Sheet builder so they never disagree on when that picker/bar
 * should show.
 */
export function needsExplicitDocumentLink(sheetsCount: number, quotesCount: number): boolean {
  return sheetsCount > 1 || quotesCount > 1;
}
