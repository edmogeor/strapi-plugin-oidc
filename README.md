<div align="center">
  <img src="https://raw.githubusercontent.com/edmogeor/strapi-plugin-oidc/main/assets/icon.png" width="140" alt="OIDC Login for Strapi Logo"/>
  <h1>OIDC Login for Strapi</h1>
  <p>
    <a href="https://www.npmjs.com/package/strapi-plugin-oidc">
      <img src="https://img.shields.io/npm/v/strapi-plugin-oidc.svg" alt="npm version">
    </a>
    <a href="https://github.com/edmogeor/strapi-plugin-oidc/actions/workflows/test.yml">
      <img src="https://github.com/edmogeor/strapi-plugin-oidc/actions/workflows/test.yml/badge.svg?branch=main" alt="Tests">
    </a>
  </p>
</div>

A Strapi plugin that provides OpenID Connect (OIDC) authentication functionality for the Strapi Admin Panel.

This plugin allows your administrators to log in to the Strapi administration interface using external OIDC identity providers such as Zitadel, Keycloak, Auth0, AWS Cognito, and others.

## Installation

You can install the plugin via `npm` or `yarn`:

```bash
# Using npm
npm install strapi-plugin-oidc

# Using yarn
yarn add strapi-plugin-oidc
```

## Configuration

To enable and configure the plugin, update your `config/plugins.js` (or `config/plugins.ts`) file with your OIDC provider's settings.

```javascript
module.exports = ({ env }) => ({
  // ...
  'strapi-plugin-oidc': {
    enabled: true,
    config: {
      // --- Required ---
      OIDC_CLIENT_ID: '[Client ID from OpenID Provider]',
      OIDC_CLIENT_SECRET: '[Client Secret from OpenID Provider]',
      OIDC_REDIRECT_URI: '[Your Strapi URL]/strapi-plugin-oidc/oidc/callback',
      OIDC_AUTHORIZATION_ENDPOINT: '[Authorization Endpoint]',
      OIDC_TOKEN_ENDPOINT: '[Token Endpoint]',
      OIDC_USER_INFO_ENDPOINT: '[User Info Endpoint]',

      // --- Defaults provided — only set if your provider differs ---
      OIDC_SCOPES: 'openid profile email',
      OIDC_GRANT_TYPE: 'authorization_code',
      OIDC_FAMILY_NAME_FIELD: 'family_name', // OIDC claim for the user's surname
      OIDC_GIVEN_NAME_FIELD: 'given_name', // OIDC claim for the user's first name

      // --- Optional ---
      OIDC_USER_INFO_ENDPOINT_WITH_AUTH_HEADER: false, // true = Bearer token header, false = query param
      OIDC_LOGOUT_URL: '', // OIDC provider logout URL; omit to return to Strapi login instead
      OIDC_SSO_BUTTON_TEXT: 'Login via SSO', // Text on the SSO button injected into the login page
      OIDC_ENFORCE: null, // null = use Admin UI setting; true/false = override it in config
      REMEMBER_ME: false, // true = persist session across browser restarts, using Strapi's built-in refresh token duration
    },
  },
  // ...
});
```

## How to Login

Once configured, you can initiate the OIDC login flow by navigating to:
`http://<your-strapi-domain>/strapi-plugin-oidc/oidc`

(e.g., `http://localhost:1337/strapi-plugin-oidc/oidc` for local development).

When the **Enforce OIDC Login** option is enabled in the Admin Settings, the standard login fields are removed from the login page and only the SSO button remains — click it to start the OIDC flow.

## Admin Settings

Once the plugin is installed and configured, you can manage the OIDC settings from the Strapi Admin Panel under **Settings** > **OIDC Plugin**.

- **Whitelist Management**: Restrict login to specific users by adding their email addresses to the whitelist. You can also whitelist entire email domains (e.g., `*@company.com`). If the whitelist is empty, any user who successfully authenticates via your OIDC provider will be able to log in and an account will be automatically created for them.
- **Default Role Assignment**: Select the default Strapi admin role that will be assigned to newly created users when they log in for the first time via OIDC.
- **SSO Login Button**: A "Login via SSO" button is always injected into the Strapi login page, allowing users to authenticate via OIDC. The button text is configurable via the `OIDC_SSO_BUTTON_TEXT` config option.
- **Enforce OIDC Login**: When enabled, the standard email/password fields, remember me checkbox, login button, and forgot-password link are removed from the login page, leaving only the SSO button. All direct login API calls are also blocked server-side. _(Note: This option is automatically disabled and grayed out if your whitelist is empty to prevent accidentally locking everyone out of the admin panel)._
- **`OIDC_ENFORCE` config override**: Setting `OIDC_ENFORCE: true` or `OIDC_ENFORCE: false` in your plugin config takes priority over the Admin UI toggle and locks it. Set `OIDC_ENFORCE: false` in your config to regain access if you are ever locked out, then restart Strapi.

## Credits & Changes

This plugin is a hard fork of the original [`strapi-plugin-sso`](https://github.com/yasudacloud/strapi-plugin-sso) created by **yasudacloud**. Huge thanks to them for creating the foundation of this plugin!

### Changes made to the original codebase:

- Removed alternative SSO methods to simplify the plugin.
- Redesigned the Whitelist and Role management UI (switched to native Strapi cards, added pagination, etc.).
- Added an OIDC logout redirect URL.
- Added an option to "Enforce OIDC login" with an admin toggle (automatically disabled if the whitelist is empty).
- Added "Remember Me" support for OIDC sessions, using Strapi's built-in refresh token duration and idle lifespan.
- Migrated the testing framework to Vitest and added comprehensive test coverage for controllers and services.
- Cleaned up dead code and unused dependencies to improve maintainability.
- Upgraded to use newer versions of Node.js.
- Added styled success and error pages.
- Always injects a "Login via SSO" button on the Strapi login page. Button text is configurable via `OIDC_SSO_BUTTON_TEXT`. When enforcement is on, standard login fields are hidden so only the SSO button is visible.
- Added misc. quality of life improvements and bug fixes.
