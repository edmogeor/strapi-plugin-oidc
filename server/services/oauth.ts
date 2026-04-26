import strapiUtils from '@strapi/utils';
import generator from 'generate-password';
import { randomUUID } from 'node:crypto';
import type { Core, UID } from '@strapi/types';
import type { StrapiContext, StrapiAdminUser } from '../types';
import { errorMessages } from '../error-strings';
import { t } from '../i18n';
import { shouldMarkSecure, COOKIE_NAMES } from '../utils/cookies';
import { renderHtmlTemplate } from '../../shared/auth-template';

export default function oauthService({ strapi }: { strapi: Core.Strapi }) {
  return {
    async createUser(
      email: string,
      lastname: string,
      firstname: string,
      locale: string,
      roles: string[] = [],
    ) {
      const userService = strapi.service('admin::user');
      const normalizedEmail = email.toLowerCase();

      const createdUser = await userService.create({
        firstname: firstname || 'unset',
        lastname: lastname || '',
        email: normalizedEmail,
        roles,
        preferedLanguage: locale,
      });

      return userService.register({
        registrationToken: createdUser.registrationToken,
        userInfo: {
          firstname: firstname || 'unset',
          lastname: lastname || 'user',
          password: generator.generate({
            length: 43,
            numbers: true,
            lowercase: true,
            uppercase: true,
            exclude: '()+_-=}{[]|:;"/?.><,`~',
            strict: true,
          }),
        },
      });
    },
    addGmailAlias(baseEmail: string, baseAlias: string): string {
      if (!baseAlias) return baseEmail;
      const alias = baseAlias.replace(/\+/g, '');
      const atIndex = baseEmail.indexOf('@');
      return `${baseEmail.slice(0, atIndex)}+${alias}${baseEmail.slice(atIndex)}`;
    },
    localeFindByHeader(headers: Record<string, string>): string {
      return headers['accept-language']?.includes('ja') ? 'ja' : 'en';
    },
    async triggerWebHook(user: StrapiAdminUser) {
      let ENTRY_CREATE: string | undefined;
      const webhookStore = (
        strapi as Core.Strapi & {
          serviceMap?: {
            get: (name: string) => { allowedEvents: { get: (event: string) => string } };
          };
        }
      ).serviceMap?.get('webhookStore');
      const eventHub = (
        strapi as Core.Strapi & {
          serviceMap?: { get: (name: string) => { emit: (event: string, data: unknown) => void } };
        }
      ).serviceMap?.get('eventHub');

      if (webhookStore) {
        ENTRY_CREATE = webhookStore.allowedEvents.get('ENTRY_CREATE');
      }
      const modelDef = strapi.getModel('admin::user');
      type SanitizeCtx = Parameters<
        typeof strapiUtils.sanitize.sanitizers.defaultSanitizeOutput
      >[0];
      type SanitizeData = Parameters<
        typeof strapiUtils.sanitize.sanitizers.defaultSanitizeOutput
      >[1];
      const sanitizedEntity = (await strapiUtils.sanitize.sanitizers.defaultSanitizeOutput(
        {
          schema: modelDef,
          getModel: (uid2: string) => strapi.getModel(uid2 as UID.Schema),
        } as unknown as SanitizeCtx,
        user as unknown as SanitizeData,
      )) as unknown as StrapiAdminUser;
      eventHub?.emit(ENTRY_CREATE ?? 'entry.create', {
        model: modelDef.modelName,
        entry: sanitizedEntity,
      });
    },
    triggerSignInSuccess(user: StrapiAdminUser) {
      const userCopy = { ...user };
      delete userCopy.password;
      const eventHub = (
        strapi as Core.Strapi & {
          serviceMap?: { get: (name: string) => { emit: (event: string, data: unknown) => void } };
        }
      ).serviceMap?.get('eventHub');
      eventHub?.emit('admin.auth.success', {
        user: userCopy,
        provider: 'strapi-plugin-oidc',
      });
    },
    renderSignUpSuccess(
      jwtToken: string,
      user: StrapiAdminUser,
      nonce: string,
      locale: string = 'en',
    ) {
      const config = strapi.config.get('plugin::strapi-plugin-oidc') as
        | { REMEMBER_ME?: boolean }
        | undefined;
      const isRememberMe = !!config?.REMEMBER_ME;
      const content = `
    <noscript>
      <div class="card">
        <div class="icon success">
          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-check">
            <path d="M20 6 9 17l-5-5"/>
          </svg>
        </div>
        <h1>${t(locale, 'auth.page.authenticating.noscript.heading')}</h1>
        <p>${t(locale, 'auth.page.authenticating.noscript.body')}</p>
      </div>
    </noscript>
    <script nonce="${nonce}">
     window.addEventListener('load', function() {
      if(${isRememberMe}){
        localStorage.setItem('jwtToken', '"${jwtToken}"');
      }else{
        document.cookie = 'jwtToken=${encodeURIComponent(jwtToken)}; Path=/';
      }
      localStorage.setItem('isLoggedIn', 'true');
      location.href = '${strapi.config.admin.url}'
     })
    </script>`;

      return renderHtmlTemplate(t(locale, 'auth.page.authenticating.title'), content, locale);
    },
    renderSignUpError(message: string, locale: string = 'en') {
      const errorTitle = t(locale, 'auth.page.error.title');
      const safeMessage = String(message)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
      const content = `
  <div class="card">
    <div class="icon">
      <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-triangle-alert">
        <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"/>
        <path d="M12 9v4"/>
        <path d="M12 17h.01"/>
      </svg>
    </div>
    <h1>${errorTitle}</h1>
    <p>${safeMessage}</p>
    <a href="${strapi.config.admin.url}" class="btn">${t(locale, 'auth.page.error.returnToLogin')}</a>
  </div>`;
      return renderHtmlTemplate(errorTitle, content, locale);
    },
    async generateToken(user: StrapiAdminUser, ctx: StrapiContext) {
      const sessionManager = (
        strapi as Core.Strapi & { sessionManager?: (...args: unknown[]) => unknown }
      ).sessionManager;
      if (!sessionManager) {
        throw new Error(errorMessages.SESSION_MANAGER_UNSUPPORTED);
      }
      const userId = String(user.id);
      const deviceId = randomUUID();

      const config = strapi.config.get('plugin::strapi-plugin-oidc') as
        | { REMEMBER_ME?: boolean }
        | undefined;
      const rememberMe = !!config?.REMEMBER_ME;

      const smAdmin = sessionManager('admin') as {
        generateRefreshToken: (
          userId: string,
          deviceId: string,
          opts: { type: 'refresh' | 'session' },
        ) => Promise<{ token: string; absoluteExpiresAt: string }>;
        generateAccessToken: (
          refreshToken: string,
        ) => Promise<{ token: string } | { error: string }>;
      };

      const { token: refreshToken, absoluteExpiresAt } = await smAdmin.generateRefreshToken(
        userId,
        deviceId,
        {
          type: rememberMe ? 'refresh' : 'session',
        },
      );

      const domain =
        (strapi.config.get('admin.auth.cookie.domain') as string | undefined) ||
        (strapi.config.get('admin.auth.domain') as string | undefined);
      const path = strapi.config.get('admin.auth.cookie.path', '/admin') as string;
      const sameSite = strapi.config.get('admin.auth.cookie.sameSite', 'lax') as
        | 'lax'
        | 'strict'
        | 'none'
        | boolean
        | undefined;

      const cookieOptions: Parameters<StrapiContext['cookies']['set']>[2] = {
        httpOnly: true,
        secure: shouldMarkSecure(strapi, ctx),
        overwrite: true,
        domain,
        path,
        sameSite,
      };

      if (rememberMe) {
        const idleLifespanSec = strapi.config.get(
          'admin.auth.sessions.idleRefreshTokenLifespan',
          1_209_600,
        ) as number;
        const idleMs = idleLifespanSec * 1000;
        const absoluteMs = new Date(absoluteExpiresAt).getTime() - Date.now();
        const ms = Math.min(idleMs, absoluteMs);
        cookieOptions.maxAge = ms;
        cookieOptions.expires = new Date(Date.now() + ms);
      }

      ctx.cookies.set(COOKIE_NAMES.adminRefresh, refreshToken, cookieOptions);
      ctx.cookies.set(COOKIE_NAMES.authenticated, '1', { ...cookieOptions, path: '/' });

      const accessResult = await smAdmin.generateAccessToken(refreshToken);
      if ('error' in accessResult) {
        throw new Error(accessResult.error);
      }
      const { token: accessToken } = accessResult;
      return accessToken;
    },
  };
}
