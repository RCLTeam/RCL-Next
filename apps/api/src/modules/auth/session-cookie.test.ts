import { describe, expect, it } from 'vitest';
import { readCookie, readSessionCookie, sessionCookieName } from './session-cookie.js';

describe('session cookie reader', () => {
  it('names the session cookie after secureCookies', () => {
    expect(sessionCookieName(false)).toBe('rcl_session');
    expect(sessionCookieName(true)).toBe('__Host-rcl_session');
  });

  it.each([
    [undefined, undefined],
    ['', undefined],
    ['theme=dark', undefined],
    ['rcl_session=abc', 'abc'],
    ['theme=dark;rcl_session=abc; lang=es', 'abc'],
    ['rcl_session=', ''],
    ['rcl_session=a=b', 'a=b'],
    ['rcl_session=abc; rcl_session=abc', undefined],
    ['xrcl_session=abc', undefined],
    ['__Host-rcl_session=abc', undefined]
  ])('readCookie(%j, "rcl_session") is %j', (header, expected) => {
    expect(readCookie(header, 'rcl_session')).toBe(expected);
  });

  it('reads only the name that matches secureCookies', () => {
    const both = 'rcl_session=plain; __Host-rcl_session=host';
    expect(readSessionCookie(both, false)).toBe('plain');
    expect(readSessionCookie(both, true)).toBe('host');
    expect(readSessionCookie('rcl_session=plain', true)).toBeUndefined();
    expect(readSessionCookie('__Host-rcl_session=host', false)).toBeUndefined();
  });
});
