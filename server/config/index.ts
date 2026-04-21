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
    OIDC_SSO_BUTTON_TEXT: 'Login via SSO',
    OIDC_ENFORCE: null, // null = use DB setting; true/false = override DB (useful for lockout recovery)
    AUDIT_LOG_RETENTION_DAYS: 90,
    OIDC_GROUP_FIELD: 'groups',
    OIDC_GROUP_ROLE_MAP: '{}',
    OIDC_REQUIRE_EMAIL_VERIFIED: true,
    OIDC_TRUSTED_IP_HEADER: '',
    OIDC_JWKS_URI: '',
    OIDC_ISSUER: '',
    OIDC_FORCE_SECURE_COOKIES: false,
  },
  validator() {},
};
