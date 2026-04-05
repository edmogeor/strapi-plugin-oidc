<div align="center">
  <img src="https://raw.githubusercontent.com/edmogeor/strapi-plugin-oidc/main/assets/icon.png" width="180" alt="OIDC Plugin for Strapi Logo"/>
</div>

# OIDC Plugin for Strapi

A Strapi plugin that provides OpenID Connect (OIDC) authentication functionality for the Strapi Admin Panel. 

This plugin allows your administrators to log in to the Strapi administration interface using external OIDC identity providers such as Zitadel, Keycloak, Auth0, AWS Cognito, and others.

## Compatibility

| NodeJS | Strapi Version | strapi-plugin-oidc Version |
| --- | --- | --- |
| 16.0.0 - 21.0.0 | v4 | 0.x.x |
| 20.0.0 - 24.x.x | v5 | 1.x.x |

*(Note: Please use version 1.0.7 or later when working with Strapi 5.24.1 or above.)*

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
      OIDC_LOGOUT_URL: '[OIDC Provider Logout URL]' 
    }
  }
  // ...
});
```

Make sure to replace the placeholder values (e.g., `[Client ID from OpenID Provider]`) with the actual connection details from your chosen OIDC identity provider.

## Features

- **Admin Login Integration:** Seamlessly log in to the Strapi admin dashboard via an external OIDC provider.
- **Whitelist Management:** Limit access by maintaining a whitelist of allowed users directly from the Strapi admin interface. Only approved users or email domains will be able to log in.
- **Customizable Attributes:** Easily map provider attributes (like given name and family name) to Strapi admin user profiles.

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