<div align="center">
  <img src="https://raw.githubusercontent.com/edmogeor/strapi-plugin-oidc/main/assets/icon.png" width="140" alt="OIDC Login for Strapi Logo"/>
  <h1>OIDC Login for Strapi</h1>
  <p>
    <a href="https://github.com/edmogeor/strapi-plugin-oidc/actions/workflows/test.yml">
      <img src="https://github.com/edmogeor/strapi-plugin-oidc/actions/workflows/test.yml/badge.svg" alt="Tests">
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
      // Set to true to store the token in local storage, false for session storage
      REMEMBER_ME: false,

      // OpenID Connect Settings
      OIDC_REDIRECT_URI: 'http://localhost:1337/strapi-plugin-oidc/oidc/callback', // Callback URI after successful login
      OIDC_CLIENT_ID: '[Client ID from OpenID Provider]',
      OIDC_CLIENT_SECRET: '[Client Secret from OpenID Provider]',

      OIDC_SCOPES: 'openid profile email', // Standard OIDC scopes

      // API Endpoints required for OIDC provider
      OIDC_AUTHORIZATION_ENDPOINT: '[Authorization Endpoint]',
      OIDC_TOKEN_ENDPOINT: '[Token Endpoint]',
      OIDC_USER_INFO_ENDPOINT: '[User Info Endpoint]',
      OIDC_USER_INFO_ENDPOINT_WITH_AUTH_HEADER: false,
      OIDC_GRANT_TYPE: 'authorization_code',

      // Customizable user field mapping for user creation
      OIDC_FAMILY_NAME_FIELD: 'family_name',
      OIDC_GIVEN_NAME_FIELD: 'given_name',

      // Redirect to OIDC provider's logout page when users log out of Strapi
      OIDC_LOGOUT_URL: '[OIDC Provider Logout URL]',
    },
  },
  // ...
});
```

Make sure to replace the placeholder values (e.g., `[Client ID from OpenID Provider]`) with the actual connection details from your chosen OIDC identity provider.

## Admin Settings

Once the plugin is installed and configured, you can manage the OIDC settings from the Strapi Admin Panel under **Settings** > **OIDC Plugin**.

- **Whitelist Management**: Restrict login to specific users by adding their email addresses to the whitelist. You can also whitelist entire email domains (e.g., `*@company.com`). If the whitelist is empty, any user who successfully authenticates via your OIDC provider will be able to log in and an account will be automatically created for them.
- **Default Role Assignment**: Select the default Strapi admin role that will be assigned to newly created users when they log in for the first time via OIDC.
- **Enforce OIDC Login**: When enabled, the default Strapi email and password login form will be disabled, forcing all administrators to log in using your OIDC provider. _(Note: This option is automatically disabled and grayed out if your whitelist is empty to prevent accidentally locking everyone out of the admin panel)._

## Credits & Changes

This plugin is a hard fork of the original [`strapi-plugin-sso`](https://github.com/yasudacloud/strapi-plugin-sso) created by **yasudacloud**. Huge thanks to them for creating the foundation of this plugin!

### Changes made to the original codebase:

- Removed alternative SSO methods to simplify the plugin.
- Redesigned the Whitelist and Role management UI (switched to native Strapi cards, added pagination, etc.).
- Added an OIDC logout redirect URL.
- Added an option to "Enforce OIDC login" with an admin toggle (automatically disabled if the whitelist is empty).
- Migrated the testing framework to Vitest and added comprehensive test coverage for controllers and services.
- Cleaned up dead code and unused dependencies to improve maintainability.
- Upgraded to use newer versions of Node.js.
- Added misc. quality of life improvements and bug fixes.
