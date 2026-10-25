import { AUTH_ROUTES, JWT_TOKEN_KEY, OIDC_SIGN_IN_PATH } from '../../../shared/constants';

const authRouteNames = AUTH_ROUTES.filter((route) => route !== 'register-admin');
const authRoutePattern = new RegExp(`/auth/(${authRouteNames.join('|')})`);

export function isAuthRoute(path: string): boolean {
  return authRoutePattern.test(path);
}

export function getOidcSignInUrl(
  location: Pick<Location, 'pathname' | 'search' | 'hash'>,
  automatic = false,
): string {
  const { pathname, search, hash } = location;
  const redirectTo = isAuthRoute(pathname)
    ? new URLSearchParams(search).get('redirectTo')
    : `${pathname}${search}${hash}`;
  const params = new URLSearchParams();
  if (redirectTo) params.set('redirectTo', redirectTo);
  if (automatic) params.set('oidc_redirect', '1');
  return `${OIDC_SIGN_IN_PATH}?${params}`;
}

interface RedirectParams {
  pathname: string;
  search: string;
  localStorage: Pick<Storage, 'getItem'>;
  cookies: string;
}

export function shouldRedirectToOidc(params: RedirectParams): boolean {
  const isServerBounce = params.search.includes('oidc_redirect=1');
  if (isServerBounce) return false;

  const hasToken =
    params.localStorage.getItem(JWT_TOKEN_KEY) ||
    params.cookies.split(';').some((c) => c.trim().startsWith(`${JWT_TOKEN_KEY}=`));

  if (hasToken) return false;

  return true;
}
