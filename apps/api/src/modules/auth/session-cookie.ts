/**
 * Returns the value of `name` from a `Cookie` header, or `undefined` when the cookie is missing or
 * appears more than once. Ambiguous cookies are rejected: only our fixed-format, opaque tokens are
 * accepted, so a second copy (for example one planted by a sibling subdomain) never wins.
 */
export function readCookie(cookieHeader: string | undefined, name: string): string | undefined {
  const entries = (cookieHeader ?? '').split(';').map((part) => part.trim());
  const matches = entries.filter((part) => part.startsWith(`${name}=`));
  return matches.length === 1 ? matches[0]?.slice(name.length + 1) : undefined;
}

/** Session cookie name: `__Host-rcl_session` over HTTPS, `rcl_session` otherwise. */
export function sessionCookieName(secureCookies: boolean): string {
  return secureCookies ? '__Host-rcl_session' : 'rcl_session';
}

/**
 * Single reader of the session cookie for the HTTP API and the ROFL upload WebSocket. It only
 * accepts the name that matches `secureCookies` and rejects duplicated cookies.
 */
export function readSessionCookie(
  cookieHeader: string | undefined,
  secureCookies: boolean
): string | undefined {
  return readCookie(cookieHeader, sessionCookieName(secureCookies));
}
