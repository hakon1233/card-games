const PROBE_ORIGIN = "http://same-site.invalid";

/**
 * The post-sign-in destination, limited to paths on this site. `next` comes
 * from the URL or a form field, so it is resolved the way a browser would (dropping tabs and
 * newlines, resolving dot segments, reading `//host` and `/\host` as hosts); anything that
 * lands on, or could be re-read as, another origin becomes "/".
 */
export function redirectPath(next: FormDataEntryValue | string | null | undefined): string {
  if (typeof next !== "string" || !next.startsWith("/")) return "/";
  const url = new URL(next, PROBE_ORIGIN);
  if (url.origin !== PROBE_ORIGIN) return "/";
  // Dot segments can collapse to a path that itself starts with `//` or `/\`, which a
  // browser would again read as another host.
  const path = url.pathname + url.search + url.hash;
  return path.startsWith("//") || path.startsWith("/\\") ? "/" : path;
}
