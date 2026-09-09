import { TranslationKeys } from '../i18n.types.js';

export const en: TranslationKeys = {
  // Auth messages
  'auth.login.success': 'Login successful',
  'auth.login.failed': 'Login failed',
  'auth.login.invalidCredentials': 'Invalid email or password',
  'auth.login.accountLocked': 'Account is locked due to multiple failed login attempts',
  'auth.login.emailNotVerified': 'Email address not verified',
  'auth.logout.success': 'Logout successful',
  'auth.passwordReset.requested': 'If an account with that email exists, a password reset link has been sent.',
  'auth.passwordReset.completed': 'Password has been reset successfully',
  'auth.passwordReset.invalidToken': 'Invalid or expired reset token',
  'auth.emailVerification.success': 'Email verified successfully',
  'auth.emailVerification.invalidToken': 'Invalid or expired verification token',
  'auth.emailVerification.alreadyVerified': 'Email is already verified',
  'auth.emailVerification.resent': 'If the account exists and is not verified, a new verification email has been sent.',
  
  // User messages
  'user.created': 'User created successfully',
  'user.updated': 'User updated successfully',
  'user.deleted': 'User deleted successfully',
  'user.notFound': 'User not found',
  'user.emailExists': 'A user with this email already exists',
  'user.creation.emailFailed': 'User could not be created: Email verification could not be sent. Please try again later.',
  
  // Validation messages
  'validation.required': 'This field is required',
  'validation.email.invalid': 'Invalid email address',
  'validation.password.weak': 'Password does not meet security requirements',
  'validation.password.mismatch': 'Passwords do not match',
  
  // Email subjects
  'email.welcome.subject': 'Welcome to {{appName}}',
  'email.passwordReset.subject': 'Reset your password',
  'email.emailVerification.subject': 'Verify your email address',
  'email.accountLocked.subject': 'Security Alert: Account locked',
  'email.twoFactorEnabled.subject': 'Two-Factor Authentication Enabled - {{appName}}',
  'email.twoFactorDisabled.subject': 'Two-Factor Authentication Disabled - {{appName}}',
  
  // Email content
  'email.greeting': 'Hello {{userName}}',
  'email.footer.doNotReply': 'This email was sent automatically. Please do not reply.',
  'email.footer.copyright': '© {{year}} {{appName}}. All rights reserved.',
  'email.button.verifyEmail': 'Verify Email',
  'email.button.resetPassword': 'Reset Password',
  'email.button.login': 'Login Now',
  'email.expiresIn': 'This link expires in {{time}}',
  'email.securityNotice': 'Security Notice',
  'email.support': 'If you have any questions, please contact support at {{email}}',
  
  // General
  'general.welcome': 'Welcome',
  'general.error': 'Error',
  'general.success': 'Success',
  'general.warning': 'Warning',
  'general.info': 'Information',
};



