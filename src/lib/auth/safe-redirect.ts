const SAFE_REDIRECT_PATH = /^\/[a-zA-Z0-9/_-]*$/;

/** Reject protocol-relative, absolute, and encoded open-redirect paths. */
export function getSafeRedirectPath(next: string | null | undefined): string {
  if (!next || !SAFE_REDIRECT_PATH.test(next)) {
    return "/";
  }

  return next;
}
