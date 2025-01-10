export function map<T, R>(input: T | undefined, fn: (value: T) => R): R | undefined {
  if (input === undefined) {
    return undefined
  } else {
    return fn(input)
  }
}