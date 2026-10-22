export function createNullMap<T>(): Record<string, T> {
  return Object.create(null) as Record<string, T>
}

export function copyNullMap<T>(source: Record<string, T>): Record<string, T> {
  const target = createNullMap<T>()
  for (const key of Object.keys(source)) target[key] = source[key]
  return target
}
