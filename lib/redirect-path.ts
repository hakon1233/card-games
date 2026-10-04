/**
 * The post-sign-in destination, limited to paths on this site. `next` comes
 * from the URL or a form field, so anything that could point elsewhere
 * (absolute URLs, `//host`, `/\host`, `@host`) becomes "/".
 */
export function redirectPath(next: FormDataEntryValue | string | null | undefined): string {
  if (typeof next !== "string") return "/";
  if (!next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return "/";
  return next;
}
