import { z } from 'zod';

const emailSchema = z.string().email();

export function isValidEmail(email: string): boolean {
  return emailSchema.safeParse(email).success;
}

export function normalizeEmail(email: unknown): string {
  return String(email ?? '')
    .trim()
    .toLowerCase();
}
