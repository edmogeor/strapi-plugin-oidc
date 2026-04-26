import { EMAIL_REGEX } from '../../shared/constants';

export function isValidEmail(email: string): boolean {
  return EMAIL_REGEX.test(email);
}
