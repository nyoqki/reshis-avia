/**
 * Russian typography of the interface text (TB-AC20 with the design review): a one- or two-letter
 * word is bound to the next word, a spaced dash to the word before it, and «%» and «₽» to their
 * number, all by a no-break space, so none of them is left alone at a line end. Returns the spots
 * that use a plain space instead.
 */
export function looseSpaces(text: string): string[] {
  const shortWords = text.match(/(?<![\p{L}\p{N}])[А-Яа-яЁё]{1,2} (?=\S)/gu) ?? [];
  const dashes = text.match(/\S —/g) ?? [];
  const units = text.match(/\d [%₽]/g) ?? [];
  return [...shortWords, ...dashes, ...units];
}
