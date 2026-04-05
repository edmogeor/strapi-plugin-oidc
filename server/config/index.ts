export default {
  default: {
    REMEMBER_ME: false,
    REMEMBER_ME_DURATION: 30 * 24 * 60 * 60 * 1000, // 30 days in milliseconds

    OIDC_REDIRECT_URI: 'http://localhost:1337/strapi-plugin-oidc/oidc/callback',
    OIDC_CLIENT_ID: '',
    OIDC_CLIENT_SECRET: '',
    OIDC_SCOPES: 'openid profile email',
    OIDC_AUTHORIZATION_ENDPOINT: '',
    OIDC_TOKEN_ENDPOINT: '',
    OIDC_USER_INFO_ENDPOINT: '',
    OIDC_USER_INFO_ENDPOINT_WITH_AUTH_HEADER: false,
    OIDC_GRANT_TYPE: 'authorization_code',
    OIDC_FAMILY_NAME_FIELD: 'family_name',
    OIDC_GIVEN_NAME_FIELD: 'given_name',
    OIDC_LOGOUT_URL: '',
  },
  validator() {},
};
