/** Nav href matches pathname exactly or as a parent segment. */
export function isNavHrefActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

/**
 * Section header: active on child routes, or on bare list path without ?status.
 * When ?status is set on the list path, the header yields to status sub-items.
 */
export function isNavSectionHeaderActive(
  pathname: string,
  base: string,
  status: string | null,
): boolean {
  if (pathname.startsWith(`${base}/`)) return true;
  return pathname === base && status === null;
}
