interface Operands {
  readonly first: number;
  readonly second: number;
}

/** Adds the two operands. */
export function add({ first, second }: Operands) {
  return first + second;
}
