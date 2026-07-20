export default {
  default: {
    REMEMBER_ME: false,

    OIDC_CLIENT_ID: '',
    OIDC_CLIENT_SECRET: '',
    OIDC_SCOPE: 'openid profile email',
    OIDC_FAMILY_NAME_FIELD: 'family_name',
    OIDC_GIVEN_NAME_FIELD: 'given_name',
    OIDC_SSO_BUTTON_TEXT: 'Login via SSO',
    OIDC_ENFORCE: null, // null = use DB setting; true/false = override DB (useful for lockout recovery)
    AUDIT_LOG_RETENTION_DAYS: 90,
    OIDC_GROUP_FIELD: 'groups',
    OIDC_GROUP_ROLE_MAP: '{}',
    OIDC_REQUIRE_EMAIL_VERIFIED: true,
    OIDC_TRUSTED_IP_HEADER: '',
    OIDC_FORCE_SECURE_COOKIES: false,
    OIDC_SKIP_LOGIN_PAGE: null, // null = use DB setting; true/false = override DB
    OIDC_ISSUER: '',
    OIDC_MAX_AGE: undefined,
    OIDC_PROMPT: '',
  },
  validator() {},
};
