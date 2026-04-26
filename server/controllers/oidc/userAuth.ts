import { isValidEmail } from '../../utils/email';
import { errorCodes, getErrorDetail, errorMessages } from '../../error-strings';
import { OidcError } from '../../oidc-errors';
import { toMessage } from './shared';
import type {
  StrapiContext,
  OidcUserInfo,
  OAuthService,
  RoleService,
  WhitelistService,
  AdminUserService,
  StrapiAdminUser,
  PluginConfig,
  GroupRoleMap,
} from '../../types';

function collectGroupMapRoleNames(userInfo: OidcUserInfo, config: PluginConfig): string[] {
  const rawGroups = userInfo[config.OIDC_GROUP_FIELD];
  if (!Array.isArray(rawGroups) || rawGroups.length === 0) return [];
  const groups = rawGroups.filter((g): g is string => typeof g === 'string');

  const raw = config.OIDC_GROUP_ROLE_MAP;
  let groupRoleMap: GroupRoleMap;
  try {
    groupRoleMap =
      typeof raw === 'string'
        ? (JSON.parse(raw) as GroupRoleMap)
        : (raw as unknown as GroupRoleMap);
  } catch {
    return [];
  }

  const roleNameSet = new Set<string>();
  for (const group of groups) {
    const roleNames = groupRoleMap[group];
    if (!roleNames) continue;
    for (const name of roleNames) {
      roleNameSet.add(name);
    }
  }
  return [...roleNameSet];
}

async function registerNewUser(
  oauthService: OAuthService,
  email: string,
  userResponseData: OidcUserInfo,
  config: PluginConfig,
  ctx: StrapiContext,
  roles: string[],
): Promise<StrapiAdminUser> {
  const defaultLocale = oauthService.localeFindByHeader(
    ctx.request.headers as Record<string, string>,
  );
  const activateUser = await oauthService.createUser(
    email,
    userResponseData[config.OIDC_FAMILY_NAME_FIELD] as string,
    userResponseData[config.OIDC_GIVEN_NAME_FIELD] as string,
    defaultLocale,
    roles,
  );
  await oauthService.triggerWebHook(activateUser);
  return activateUser;
}

function rolesChanged(current: Set<string>, next: Set<string>): boolean {
  if (current.size !== next.size) return true;
  return [...next].some((id) => !current.has(id));
}

async function updateUserRoles(
  user: StrapiAdminUser,
  currentRoleIds: Set<string>,
  newRoleIds: string[],
): Promise<void> {
  try {
    strapi.log.info(
      `[OIDC] Roles updated for user ${user.id}: [${[...currentRoleIds].join(',')}] -> [${newRoleIds.join(',')}]`,
    );
    await strapi.db.query('admin::user').update({
      where: { id: user.id },
      data: { roles: newRoleIds },
    });
  } catch (updateErr) {
    strapi.log.error({
      code: errorCodes.ROLE_UPDATE_FAILED,
      userId: user.id,
      detail: getErrorDetail('role_update_failed', {
        userId: user.id,
        error: toMessage(updateErr),
      }),
    });
    throw updateErr;
  }
}

type ResolvedRoles = {
  roles: string[];
  fromGroupMapping: boolean;
  resolvedRoleNames: string[];
};

async function resolveRolesFromGroups(candidateNames: string[]): Promise<ResolvedRoles> {
  const matchedRoles = await strapi.db.query('admin::role').findMany({
    where: { name: { $in: candidateNames } },
    select: ['id', 'name'],
  });
  const nameToId = new Map(matchedRoles.map((r) => [r.name, String(r.id)]));
  const roles: string[] = [];
  for (const name of candidateNames) {
    const id = nameToId.get(name);
    if (id) roles.push(id);
  }
  return {
    roles,
    fromGroupMapping: true,
    resolvedRoleNames: matchedRoles.map((r) => r.name),
  };
}

async function resolveRolesFromDefaults(roleService: RoleService): Promise<ResolvedRoles> {
  const oidcRolesResult = await roleService.oidcRoles();
  const roles = oidcRolesResult?.roles || [];
  if (roles.length === 0) {
    return { roles, fromGroupMapping: false, resolvedRoleNames: [] };
  }
  const records = await strapi.db.query('admin::role').findMany({
    where: { id: { $in: roles.map(Number) } },
    select: ['id', 'name'],
  });
  return {
    roles,
    fromGroupMapping: false,
    resolvedRoleNames: records.map((r) => r.name),
  };
}

async function resolveRoles(
  userResponseData: OidcUserInfo,
  config: PluginConfig,
  roleService: RoleService,
): Promise<ResolvedRoles> {
  const candidateNames = collectGroupMapRoleNames(userResponseData, config);
  if (candidateNames.length > 0) {
    return resolveRolesFromGroups(candidateNames);
  }
  return resolveRolesFromDefaults(roleService);
}

async function ensureUser(
  userService: AdminUserService,
  oauthService: OAuthService,
  email: string,
  userResponseData: OidcUserInfo,
  config: PluginConfig,
  ctx: StrapiContext,
  resolved: ResolvedRoles,
): Promise<{ user: StrapiAdminUser; userCreated: boolean; rolesUpdated: boolean }> {
  const existing = await userService.findOneByEmail(email, ['roles']);
  if (!existing) {
    try {
      const user = await registerNewUser(
        oauthService,
        email,
        userResponseData,
        config,
        ctx,
        resolved.roles,
      );
      return { user, userCreated: true, rolesUpdated: true };
    } catch (e) {
      const msg = toMessage(e);
      throw new OidcError('user_creation_failed', msg, e);
    }
  }
  if (!resolved.fromGroupMapping || resolved.roles.length === 0) {
    return { user: existing, userCreated: false, rolesUpdated: false };
  }
  const currentRoleIds = new Set((existing.roles ?? []).map((r) => String(r.id)));
  if (!rolesChanged(currentRoleIds, new Set(resolved.roles))) {
    return { user: existing, userCreated: false, rolesUpdated: false };
  }
  await updateUserRoles(existing, currentRoleIds, resolved.roles);
  return { user: existing, userCreated: false, rolesUpdated: true };
}

export async function handleUserAuthentication(
  userService: AdminUserService,
  oauthService: OAuthService,
  roleService: RoleService,
  whitelistService: WhitelistService,
  userResponseData: OidcUserInfo,
  config: PluginConfig,
  ctx: StrapiContext,
): Promise<{
  activateUser: StrapiAdminUser;
  jwtToken: string;
  userCreated: boolean;
  rolesUpdated: boolean;
  resolvedRoleNames: string[];
}> {
  const email = String(userResponseData.email ?? '').toLowerCase();
  if (!email || !isValidEmail(email)) {
    throw new OidcError('invalid_email', errorMessages.INVALID_EMAIL);
  }

  // OIDC Core §5.7: email_verified SHOULD accompany email. Treat missing as unverified.
  if (config.OIDC_REQUIRE_EMAIL_VERIFIED !== false) {
    const emailVerified = userResponseData.email_verified;
    const isVerified = emailVerified === true || emailVerified === 'true';
    if (!isVerified) {
      throw new OidcError('email_not_verified', errorMessages.EMAIL_NOT_VERIFIED);
    }
  }

  await whitelistService.checkWhitelistForEmail(email);

  const resolved = await resolveRoles(userResponseData, config, roleService);
  const { user, userCreated, rolesUpdated } = await ensureUser(
    userService,
    oauthService,
    email,
    userResponseData,
    config,
    ctx,
    resolved,
  );

  const jwtToken = await oauthService.generateToken(user, ctx);
  oauthService.triggerSignInSuccess(user);

  return {
    activateUser: user,
    jwtToken,
    userCreated,
    rolesUpdated,
    resolvedRoleNames: resolved.resolvedRoleNames,
  };
}
