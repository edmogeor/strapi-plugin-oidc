export default {
  default: {
    REMEMBER_ME: false,

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
    OIDC_SSO_BUTTON_TEXT: 'Login via SSO',
    OIDC_ENFORCE: null, // null = use DB setting; true/false = override DB (useful for lockout recovery)
  },
  validator() {},
};
