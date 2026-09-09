/**
 * Internationalization types
 */

export type SupportedLanguage = 'en' | 'de';

export interface TranslationKeys {
  // Auth messages
  'auth.login.success': string;
  'auth.login.failed': string;
  'auth.login.invalidCredentials': string;
  'auth.login.accountLocked': string;
  'auth.login.emailNotVerified': string;
  'auth.logout.success': string;
  'auth.passwordReset.requested': string;
  'auth.passwordReset.completed': string;
  'auth.passwordReset.invalidToken': string;
  'auth.emailVerification.success': string;
  'auth.emailVerification.invalidToken': string;
  'auth.emailVerification.alreadyVerified': string;
  'auth.emailVerification.resent': string;
  
  // User messages
  'user.created': string;
  'user.updated': string;
  'user.deleted': string;
  'user.notFound': string;
  'user.emailExists': string;
  'user.creation.emailFailed': string;
  
  // Validation messages
  'validation.required': string;
  'validation.email.invalid': string;
  'validation.password.weak': string;
  'validation.password.mismatch': string;
  
  // Email subjects
  'email.welcome.subject': string;
  'email.passwordReset.subject': string;
  'email.emailVerification.subject': string;
  'email.accountLocked.subject': string;
  'email.twoFactorEnabled.subject': string;
  'email.twoFactorDisabled.subject': string;
  
  // Email content
  'email.greeting': string;
  'email.footer.doNotReply': string;
  'email.footer.copyright': string;
  'email.button.verifyEmail': string;
  'email.button.resetPassword': string;
  'email.button.login': string;
  'email.expiresIn': string;
  'email.securityNotice': string;
  'email.support': string;
  
  // General
  'general.welcome': string;
  'general.error': string;
  'general.success': string;
  'general.warning': string;
  'general.info': string;
}

export type TranslationKey = keyof TranslationKeys;

export interface I18nConfig {
  defaultLanguage: SupportedLanguage;
  fallbackLanguage: SupportedLanguage;
  supportedLanguages: SupportedLanguage[];
}

export interface TranslationFunction {
  (key: TranslationKey, params?: Record<string, any>): string;
}

export interface I18nService {
  t: TranslationFunction;
  setLanguage(lang: SupportedLanguage): void;
  getLanguage(): SupportedLanguage;
  isSupported(lang: string): boolean;
}



