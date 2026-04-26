import { z } from 'zod';

export const updateSettingsSchema = z.object({
  useWhitelist: z.boolean(),
  enforceOIDC: z.boolean(),
});

export const registerSchema = z.object({
  email: z.union([z.string(), z.array(z.string())]),
});

export const EmailUserSchema = z.object({
  email: z.string().email(),
});

export const importUsersSchema = z.object({
  users: z.array(z.object({ email: z.unknown().optional() })),
});

export const syncUsersSchema = z.object({
  users: z.array(EmailUserSchema),
});

export const roleUpdateSchema = z.object({
  roles: z.array(
    z.object({
      oauth_type: z.string(),
      role: z.array(z.number()),
    }),
  ),
});

export type UpdateSettingsInput = z.infer<typeof updateSettingsSchema>;
export type RegisterInput = z.infer<typeof registerSchema>;
export type ImportUsersInput = z.infer<typeof importUsersSchema>;
export type SyncUsersInput = z.infer<typeof syncUsersSchema>;
export type RoleUpdateInput = z.infer<typeof roleUpdateSchema>;
