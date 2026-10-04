const PROBE_ORIGIN = "http://same-site.invalid";

/**
 * The post-sign-in destination, limited to paths on this site. `next` comes
 * from the URL or a form field, so it is resolved the way a browser would
 * (which drops tabs and newlines and treats `//host` and `/\host` as hosts);
 * anything that lands on another origin becomes "/".
 */
export function redirectPath(next: FormDataEntryValue | string | null | undefined): string {
  if (typeof next !== "string" || !next.startsWith("/")) return "/";
  const url = new URL(next, PROBE_ORIGIN);
  if (url.origin !== PROBE_ORIGIN) return "/";
  return url.pathname + url.search + url.hash;
}
