import { TranslationKeys } from '../i18n.types.js';

export const de: TranslationKeys = {
  // Auth messages
  'auth.login.success': 'Anmeldung erfolgreich',
  'auth.login.failed': 'Anmeldung fehlgeschlagen',
  'auth.login.invalidCredentials': 'Ungültige E-Mail-Adresse oder Passwort',
  'auth.login.accountLocked': 'Konto ist aufgrund mehrerer fehlgeschlagener Anmeldeversuche gesperrt',
  'auth.login.emailNotVerified': 'E-Mail-Adresse nicht verifiziert',
  'auth.logout.success': 'Abmeldung erfolgreich',
  'auth.passwordReset.requested': 'Falls ein Konto mit dieser E-Mail-Adresse existiert, wurde ein Link zum Zurücksetzen des Passworts gesendet.',
  'auth.passwordReset.completed': 'Passwort wurde erfolgreich zurückgesetzt',
  'auth.passwordReset.invalidToken': 'Ungültiger oder abgelaufener Token',
  'auth.emailVerification.success': 'E-Mail erfolgreich verifiziert',
  'auth.emailVerification.invalidToken': 'Ungültiger oder abgelaufener Verifizierungstoken',
  'auth.emailVerification.alreadyVerified': 'E-Mail ist bereits verifiziert',
  'auth.emailVerification.resent': 'Falls das Konto existiert und nicht verifiziert ist, wurde eine neue Verifizierungs-E-Mail gesendet.',
  
  // User messages
  'user.created': 'Benutzer erfolgreich erstellt',
  'user.updated': 'Benutzer erfolgreich aktualisiert',
  'user.deleted': 'Benutzer erfolgreich gelöscht',
  'user.notFound': 'Benutzer nicht gefunden',
  'user.emailExists': 'Ein Benutzer mit dieser E-Mail-Adresse existiert bereits',
  'user.creation.emailFailed': 'Benutzer konnte nicht erstellt werden: E-Mail-Verifizierung konnte nicht gesendet werden. Bitte versuchen Sie es später erneut.',
  
  // Validation messages
  'validation.required': 'Dieses Feld ist erforderlich',
  'validation.email.invalid': 'Ungültige E-Mail-Adresse',
  'validation.password.weak': 'Passwort erfüllt nicht die Sicherheitsanforderungen',
  'validation.password.mismatch': 'Passwörter stimmen nicht überein',
  
  // Email subjects
  'email.welcome.subject': 'Willkommen bei {{appName}}',
  'email.passwordReset.subject': 'Passwort zurücksetzen',
  'email.emailVerification.subject': 'E-Mail-Adresse bestätigen',
  'email.accountLocked.subject': 'Sicherheitswarnung: Konto gesperrt',
  'email.twoFactorEnabled.subject': 'Zwei-Faktor-Authentifizierung aktiviert - {{appName}}',
  'email.twoFactorDisabled.subject': 'Zwei-Faktor-Authentifizierung deaktiviert - {{appName}}',
  
  // Email content
  'email.greeting': 'Hallo {{userName}}',
  'email.footer.doNotReply': 'Diese E-Mail wurde automatisch gesendet. Bitte antworten Sie nicht darauf.',
  'email.footer.copyright': '© {{year}} {{appName}}. Alle Rechte vorbehalten.',
  'email.button.verifyEmail': 'E-Mail bestätigen',
  'email.button.resetPassword': 'Passwort zurücksetzen',
  'email.button.login': 'Jetzt anmelden',
  'email.expiresIn': 'Dieser Link ist {{time}} gültig',
  'email.securityNotice': 'Sicherheitshinweis',
  'email.support': 'Bei Fragen wenden Sie sich bitte an den Support unter {{email}}',
  
  // General
  'general.welcome': 'Willkommen',
  'general.error': 'Fehler',
  'general.success': 'Erfolg',
  'general.warning': 'Warnung',
  'general.info': 'Information',
};



