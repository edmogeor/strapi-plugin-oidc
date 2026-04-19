import strapiUtils from '@strapi/utils';
import generator from 'generate-password';
import { randomUUID } from 'node:crypto';
import type { Core } from '@strapi/types';
import type { StrapiContext, StrapiAdminUser } from '../types';
import { errorMessages } from '../error-strings';
import { authPageMessages } from '../audit-error-strings';

function renderHtmlTemplate(title: string, content: string, locale: string = 'en'): string {
  return `
<!doctype html>
<html lang="${locale}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${title}</title>
  <style>
    :root {
      --bg-color: #f6f6f9;
      --card-bg: #ffffff;
      --text-color: #32324d;
      --text-muted: #666687;
      --btn-bg: #4945ff;
      --btn-hover: #271fe0;
      --btn-text: #ffffff;
      --icon-bg: #fcecea;
      --icon-color: #d02b20;
      --success-bg: #eafbe7;
      --success-color: #328048;
      --shadow: 0 1px 4 rgba(33, 33, 52, 0.1);
    }
    @media (prefers-color-scheme: dark) {
      :root {
        --bg-color: #181826;
        --card-bg: #212134;
        --text-color: #ffffff;
        --text-muted: #a5a5ba;
        --btn-bg: #4945ff;
        --btn-hover: #7b79ff;
        --btn-text: #ffffff;
        --icon-bg: #4a2123;
        --icon-color: #f23628;
        --success-bg: #1c3523;
        --success-color: #55ca76;
        --shadow: 0 1px 4 rgba(0, 0, 0, 0.5);
      }
    }
    body {
      margin: 0;
      padding: 0;
      display: flex;
      justify-content: center;
      align-items: center;
      height: 100vh;
      background-color: var(--bg-color);
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      color: var(--text-color);
    }
    .card {
      background: var(--card-bg);
      padding: 32px 40px;
      border-radius: 8px;
      box-shadow: var(--shadow);
      max-width: 400px;
      width: 100%;
      text-align: center;
      box-sizing: border-box;
    }
    .icon {
      width: 48px;
      height: 48px;
      background-color: var(--icon-bg);
      color: var(--icon-color);
      border-radius: 50%;
      display: inline-flex;
      justify-content: center;
      align-items: center;
      margin-bottom: 24px;
    }
    .icon.success {
      background-color: var(--success-bg);
      color: var(--success-color);
    }
    .icon svg {
      width: 24px;
      height: 24px;
      stroke: currentColor;
      stroke-width: 2;
      stroke-linecap: round;
      stroke-linejoin: round;
      fill: none;
    }
    h1 {
      margin: 0 0 12px 0;
      font-size: 20px;
      font-weight: 600;
      color: var(--text-color);
    }
    p {
      margin: 0 0 32px 0;
      font-size: 14px;
      line-height: 1.5;
      color: var(--text-muted);
    }
    .btn {
      display: inline-block;
      background-color: var(--btn-bg);
      color: var(--btn-text);
      padding: 10px 16px;
      border-radius: 4px;
      text-decoration: none;
      font-size: 14px;
      font-weight: 500;
      transition: background-color 0.2s;
    }
    .btn:hover {
      background-color: var(--btn-hover);
    }
  </style>
</head>
<body>
  ${content}
</body>
</html>`;
}

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
      const sanitizedEntity = (await strapiUtils.sanitize.sanitizers.defaultSanitizeOutput(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        { schema: modelDef, getModel: (uid2: any) => strapi.getModel(uid2) } as any,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        user as any,
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
      const messages = authPageMessages(locale);

      const content = `
    <noscript>
      <div class="card">
        <div class="icon success">
          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-check">
            <path d="M20 6 9 17l-5-5"/>
          </svg>
        </div>
        <h1>${messages.noscriptHeading}</h1>
        <p>${messages.noscriptBody}</p>
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

      return renderHtmlTemplate(messages.authenticatingTitle, content, locale);
    },
    renderSignUpError(message: string, locale: string = 'en') {
      const messages = authPageMessages(locale);
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
    <h1>${messages.errorTitle}</h1>
    <p>${safeMessage}</p>
    <a href="${strapi.config.admin.url}" class="btn">${messages.returnToLogin}</a>
  </div>`;
      return renderHtmlTemplate(messages.errorTitle, content, locale);
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

      const isProduction = strapi.config.get('environment') === 'production';
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
        secure: isProduction && ctx.request.secure,
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

      ctx.cookies.set('strapi_admin_refresh', refreshToken, cookieOptions);
      ctx.cookies.set('oidc_authenticated', '1', { ...cookieOptions, path: '/' });

      const accessResult = await smAdmin.generateAccessToken(refreshToken);
      if ('error' in accessResult) {
        throw new Error(accessResult.error);
      }
      const { token: accessToken } = accessResult;
      return accessToken;
    },
  };
}
