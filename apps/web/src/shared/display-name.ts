/** Remove Unicode font variants only at presentation boundaries, never in stored data or IDs. */
export function displayName(value: string): string {
  return value.replace(
    /[\u{1D400}-\u{1D7FF}\u2102\u210A-\u210E\u2110-\u2113\u2115\u2119-\u211D\u2124\u2128\u212C-\u212D\u212F-\u2131\u2133-\u2134\u2139\u213C-\u213F\u2145-\u2149\uFF10-\uFF19\uFF21-\uFF3A\uFF41-\uFF5A]/gu,
    (character) => character.normalize('NFKC')
  );
}
