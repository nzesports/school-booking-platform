const LOCAL_ORIGIN = "http://local.invalid";

// Returns `path` only when it is a same-site path, otherwise `fallback`.
// Prefix checks alone are not enough: URL parsers strip tabs and newlines and
// treat "\" as "/", so "/\t/evil.com" or "/\\evil.com" become "//evil.com".
// Reject those characters outright, then confirm the parsed origin is unchanged.
export function safeLocalPath(path: string | null | undefined, fallback: string) {
  if (!path || !path.startsWith("/") || path.startsWith("//") || /[\u0000-\u001f\u007f\\]/.test(path)) {
    return fallback;
  }

  try {
    return new URL(path, LOCAL_ORIGIN).origin === LOCAL_ORIGIN ? path : fallback;
  } catch {
    return fallback;
  }
}
