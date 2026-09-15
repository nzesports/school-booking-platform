// The untyped Supabase client infers embedded relations as arrays even for
// many-to-one foreign keys. Normalize either response shape at the data edge.
export function relationOne<T>(value: T | T[] | null | undefined): T | null {
  return Array.isArray(value) ? value[0] ?? null : value ?? null;
}
