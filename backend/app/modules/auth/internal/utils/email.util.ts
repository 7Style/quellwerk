/**
 * Auth module local email utilities (module-independent)
 */

export function isValidEmail(email: string): boolean {
  if (typeof email !== 'string') {
    return false;
  }

  const trimmed = email.trim();
  if (trimmed.length === 0) {
    return false;
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(trimmed);
}






