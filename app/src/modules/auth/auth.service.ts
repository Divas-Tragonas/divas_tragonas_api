import { env } from '../../config/env';

export function validatePassword(password: string): boolean {
  return password === env.ADMIN_PASSWORD;
}
