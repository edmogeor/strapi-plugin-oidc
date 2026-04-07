export default {
  default: {
    REMEMBER_ME: false,

    OIDC_REDIRECT_URI: 'http://localhost:1337/strapi-plugin-oidc/oidc/callback',
    OIDC_CLIENT_ID: '',
    OIDC_CLIENT_SECRET: '',
    OIDC_SCOPE: 'openid profile email',
    OIDC_AUTHORIZATION_ENDPOINT: '',
    OIDC_TOKEN_ENDPOINT: '',
    OIDC_USERINFO_ENDPOINT: '',
    OIDC_GRANT_TYPE: 'authorization_code',
    OIDC_FAMILY_NAME_FIELD: 'family_name',
    OIDC_GIVEN_NAME_FIELD: 'given_name',
    OIDC_END_SESSION_ENDPOINT: '',
    OIDC_POST_LOGOUT_REDIRECT_URI: '', // Where to land after the provider has logged the user out (RP-Initiated Logout)
    OIDC_ISSUER: '', // Provider issuer URL — used to validate iss claim in backchannel logout tokens
    OIDC_JWKS_URI: '', // Provider JWKS endpoint — required for backchannel logout token signature verification
    OIDC_SSO_BUTTON_TEXT: 'Login via SSO',
    OIDC_ENFORCE: null, // null = use DB setting; true/false = override DB (useful for lockout recovery)
  },
  validator() {},
};
