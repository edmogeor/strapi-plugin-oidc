<div align="center">
 <img src="https://github.com/edmogeor/strapi-plugin-oidc/blob/main/docs/strapi-plugin-oidc.png?raw=true" width="180"/>
</div>

# Strapi plugin strapi-plugin-oidc

This plugin can provide single sign-on.

You will be able to log in to the administration screen using OIDC providers (like Zitadel).

Please read the [documents](#user-content-documentationenglish) for some precautions.

**If possible, consider using the Gold Plan features.**

# Version

| NodeJS          | Strapi | strapi-plugin-oidc |
|-----------------|--------|-------------------|
| 16.0.0 - 21.0.0 | v4     | 0.\*.\*           |
| 20.0.0 - 24.x.x | v5     | 1.\*.\*           |

Please use version 1.0.7 or later when working with Strapi 5.24.1 or above.

# Easy to install

```shell
yarn add strapi-plugin-oidc
```

or

```shell
npm i strapi-plugin-oidc
```

# Requirements

- **strapi-plugin-oidc**
- an OIDC provider (like Zitadel)

# Example Configuration

```javascript
// config/plugins.js
module.exports = ({env}) => ({
  'strapi-plugin-oidc': {
    enabled: true,
    config: {
      // Either sets token to session storage if false or local storage if true
      REMEMBER_ME: false,

      // OpenID Connect
      OIDC_REDIRECT_URI: 'http://localhost:1337/strapi-plugin-oidc/oidc/callback', // URI after successful login
      OIDC_CLIENT_ID: '[Client ID from OpenID Provider]',
      OIDC_CLIENT_SECRET: '[Client Secret from OpenID Provider]',

      OIDC_SCOPES: 'openid profile email', // https://oauth.net/2/scope/
      // API Endpoints required for OIDC
      OIDC_AUTHORIZATION_ENDPOINT: '[API Endpoint]',
      OIDC_TOKEN_ENDPOINT: '[API Endpoint]',
      OIDC_USER_INFO_ENDPOINT: '[API Endpoint]',
      OIDC_USER_INFO_ENDPOINT_WITH_AUTH_HEADER: false,
      OIDC_GRANT_TYPE: 'authorization_code', // https://oauth.net/2/grant-types/
      // customizable username arguments
      OIDC_FAMILY_NAME_FIELD: 'family_name',
      OIDC_GIVEN_NAME_FIELD: 'given_name',
      
      OIDC_LOGOUT_URL: '[OIDC Provider Logout URL]' // redirect to OIDC logout page when users log out of Strapi
    }
  }
})
```

Of the above, the environment variable for the provider you wish to use is all that is needed.

# Documentation(English)

[OIDC Single Sign On Setup](https://github.com/edmogeor/strapi-plugin-oidc/blob/main/docs/en/oidc/setup.md)

[whitelist](https://github.com/edmogeor/strapi-plugin-oidc/blob/main/docs/whitelist.md)

# Documentation(Japanese)

[Description](https://github.com/edmogeor/strapi-plugin-oidc/blob/main/docs/README.md)

TODO OIDC Single Sign On Setup

# Demo

![CognitoDemo](https://github.com/edmogeor/strapi-plugin-oidc/blob/main/docs/demo.gif?raw=true "DemoMovie")
