import { JWT_TOKEN_KEY } from '../../../shared/constants';

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
