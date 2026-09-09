import { EmailTemplate, RenderedEmail } from "../email.types.js";
import { SupportedLanguage } from "../../i18n/i18n.types.js";
import { I18nService } from "../../i18n/i18n.service.js";
import { baseTemplate } from "./base.template.js";
import { appConfig } from "../../../config/app.config.js";

interface TemplateData {
  [key: string]: any;
}

type TemplateRenderer = (
  data: TemplateData,
  i18n: I18nService
) => RenderedEmail;

const templates: Record<EmailTemplate, TemplateRenderer> = {
  welcome: (data, i18n) => {
    const subject = i18n.t("email.welcome.subject");
    const greeting = i18n.t("email.greeting", { userName: data.userName });
    const loginButton = i18n.t("email.button.login");

    const passwordInfo = data.temporaryPassword
      ? `<div class="warning">
          <p><strong>${i18n.t("general.warning")}:</strong> ${
          data.temporaryPassword
        }</p>
          <p>${
            i18n.getLanguage() === "de"
              ? "Bitte ändern Sie dieses Passwort bei Ihrer ersten Anmeldung!"
              : "Please change this password on your first login!"
          }</p>
        </div>`
      : "";

    const featuresText =
      i18n.getLanguage() === "de"
        ? `<h2>Die wichtigsten Features:</h2>
        <ul>
          <li>Umfassendes User Management</li>
          <li>Role-Based Access Control (RBAC)</li>
          <li>Sichere Authentifizierung</li>
          <li>Audit Logging für Compliance</li>
        </ul>`
        : `<h2>Key Features:</h2>
        <ul>
          <li>Comprehensive User Management</li>
          <li>Role-Based Access Control (RBAC)</li>
          <li>Secure Authentication</li>
          <li>Audit Logging for Compliance</li>
        </ul>`;

    const html = baseTemplate(
      `
      <h1>${i18n.t("general.welcome")}!</h1>
      <p>${greeting},</p>
      <p>${
        i18n.getLanguage() === "de"
          ? "Ihr Konto wurde erfolgreich erstellt. Sie können sich jetzt mit Ihrer E-Mail-Adresse anmelden."
          : "Your account has been successfully created. You can now log in with your email address."
      }</p>
      ${passwordInfo}
      <div style="text-align: center;">
        <a href="${data.loginUrl}" class="button" style="color: #ffffff !important; text-decoration: none;">${loginButton}</a>
      </div>
      ${featuresText}
    `,
      {
        doNotReply: i18n.t("email.footer.doNotReply"),
        copyright: i18n.t("email.footer.copyright", {
          year: new Date().getFullYear(),
        }),
      }
    );

    const text = `${subject}

${greeting},

${
  i18n.getLanguage() === "de"
    ? "Ihr Konto wurde erfolgreich erstellt."
    : "Your account has been successfully created."
}
${
  data.temporaryPassword
    ? `\n${i18n.t("general.warning")}: ${data.temporaryPassword}\n`
    : ""
}

${loginButton}: ${data.loginUrl}

${appConfig.name}`;

    return { html, text, subject };
  },

  emailVerification: (data, i18n) => {
    const subject = i18n.t("email.emailVerification.subject");
    const greeting = i18n.t("email.greeting", { userName: data.userName });
    const verifyButton = i18n.t("email.button.verifyEmail");
    const expiresIn = i18n.t("email.expiresIn", { time: data.expiresIn });
    const support = i18n.t("email.support", { email: data.supportEmail });

    const html = baseTemplate(
      `
      <h1>${subject}</h1>
      <p>${greeting},</p>
      <p>${
        i18n.getLanguage() === "de"
          ? `Vielen Dank für Ihre Registrierung bei ${appConfig.name}! Bitte bestätigen Sie Ihre E-Mail-Adresse, um Ihr Konto zu aktivieren.`
          : `Thank you for registering with ${appConfig.name}! Please verify your email address to activate your account.`
      }</p>
      <div style="text-align: center; margin: 30px 0;">
        <a href="${data.verificationUrl}" class="button" style="color: #ffffff !important; text-decoration: none;">${verifyButton}</a>
      </div>
      <p style="margin-top: 30px;">${
        i18n.getLanguage() === "de"
          ? "Oder kopieren Sie diesen Link in Ihren Browser:"
          : "Or copy this link to your browser:"
      }</p>
      <p style="word-break: break-all; color: #6b7280; background-color: #f3f4f6; padding: 12px; border-radius: 4px; font-family: monospace; font-size: 14px;">${
        data.verificationUrl
      }</p>
      
      <div class="warning">
        <strong>⏱️ ${expiresIn}</strong>
      </div>
      
      <div style="background-color: #f9fafb; padding: 20px; border-radius: 6px; margin: 20px 0;">
        <h3 style="margin-top: 0; color: #374151;">${
          i18n.getLanguage() === "de"
            ? "Warum ist das wichtig?"
            : "Why is this important?"
        }</h3>
        <ul style="color: #6b7280; line-height: 1.8;">
          ${
            i18n.getLanguage() === "de"
              ? `<li>Sicherstellung, dass Sie Zugriff auf diese E-Mail-Adresse haben</li>
               <li>Schutz vor Missbrauch Ihrer E-Mail-Adresse</li>
               <li>Aktivierung aller Funktionen Ihres Kontos</li>`
              : `<li>Ensures you have access to this email address</li>
               <li>Protects against misuse of your email address</li>
               <li>Activates all features of your account</li>`
          }
        </ul>
      </div>
      
      <p style="color: #6b7280; font-size: 14px;">${support}</p>
    `,
      {
        doNotReply: i18n.t("email.footer.doNotReply"),
        copyright: i18n.t("email.footer.copyright", {
          year: new Date().getFullYear(),
        }),
      }
    );

    const text = `${subject}

${greeting},

${
  i18n.getLanguage() === "de"
    ? "Bitte bestätigen Sie Ihre E-Mail-Adresse:"
    : "Please verify your email address:"
}
${data.verificationUrl}

${expiresIn}

${support}

${appConfig.name}`;

    return { html, text, subject };
  },

  passwordReset: (data, i18n) => {
    const subject = i18n.t("email.passwordReset.subject");
    const greeting = i18n.t("email.greeting", { userName: data.userName });
    const resetButton = i18n.t("email.button.resetPassword");
    const expiresIn = i18n.t("email.expiresIn", { time: data.expiresIn });
    const securityNotice = i18n.t("email.securityNotice");
    const support = i18n.t("email.support", { email: data.supportEmail });

    const html = baseTemplate(
      `
      <h1>${subject}</h1>
      <p>${greeting},</p>
      <p>${
        i18n.getLanguage() === "de"
          ? "Sie haben eine Anfrage zum Zurücksetzen Ihres Passworts gestellt. Klicken Sie auf den folgenden Link, um ein neues Passwort zu erstellen:"
          : "You have requested to reset your password. Click the following link to create a new password:"
      }</p>
      <div style="text-align: center; margin: 30px 0;">
        <a href="${data.resetUrl}" class="button" style="color: #ffffff !important; text-decoration: none;">${resetButton}</a>
      </div>
      <p style="margin-top: 30px;">${
        i18n.getLanguage() === "de"
          ? "Oder kopieren Sie diesen Link in Ihren Browser:"
          : "Or copy this link to your browser:"
      }</p>
      <p style="word-break: break-all; color: #6b7280; background-color: #f3f4f6; padding: 12px; border-radius: 4px; font-family: monospace; font-size: 14px;">${
        data.resetUrl
      }</p>
      
      <div class="warning">
        <strong>⏱️ ${expiresIn}</strong>
      </div>
      
      <div style="background-color: #f9fafb; padding: 20px; border-radius: 6px; margin: 20px 0;">
        <h3 style="margin-top: 0; color: #374151;">${securityNotice}:</h3>
        <ul style="color: #6b7280; line-height: 1.8;">
          ${
            i18n.getLanguage() === "de"
              ? `<li>Falls Sie diese Anfrage nicht gestellt haben, ignorieren Sie diese E-Mail.</li>
               <li>Ihr Passwort bleibt unverändert, solange Sie nicht auf den Link klicken.</li>
               <li>Dieser Link kann nur einmal verwendet werden.</li>
               <li>Nach dem Zurücksetzen werden alle aktiven Sitzungen beendet.</li>`
              : `<li>If you did not request this, please ignore this email.</li>
               <li>Your password remains unchanged unless you click the link.</li>
               <li>This link can only be used once.</li>
               <li>After resetting, all active sessions will be terminated.</li>`
          }
        </ul>
      </div>
      
      <p style="color: #6b7280; font-size: 14px;">${support}</p>
    `,
      {
        doNotReply: i18n.t("email.footer.doNotReply"),
        copyright: i18n.t("email.footer.copyright", {
          year: new Date().getFullYear(),
        }),
      }
    );

    const text = `${subject}

${greeting},

${
  i18n.getLanguage() === "de"
    ? "Zum Zurücksetzen Ihres Passworts öffnen Sie bitte folgenden Link:"
    : "To reset your password, please open the following link:"
}
${data.resetUrl}

${expiresIn}

${support}

${appConfig.name}`;

    return { html, text, subject };
  },

  accountLocked: (data, i18n) => {
    const subject = i18n.t("email.accountLocked.subject");
    const greeting = i18n.t("email.greeting", { userName: data.userName });
    const securityNotice = i18n.t("email.securityNotice");
    const support = i18n.t("email.support", { email: data.supportEmail });

    const html = baseTemplate(
      `
      <h1>${
        i18n.getLanguage() === "de"
          ? "Ihr Konto wurde gesperrt"
          : "Your account has been locked"
      }</h1>
      <div class="warning">
        <p><strong>${securityNotice}:</strong> ${i18n.t(
        "auth.login.accountLocked"
      )}</p>
      </div>
      <p>${greeting},</p>
      <p>${
        i18n.getLanguage() === "de"
          ? "Aus Sicherheitsgründen wurde Ihr Konto vorübergehend gesperrt, nachdem mehrere fehlgeschlagene Anmeldeversuche festgestellt wurden."
          : "For security reasons, your account has been temporarily locked after detecting multiple failed login attempts."
      }</p>
      <p><strong>${
        i18n.getLanguage() === "de" ? "Gesperrt bis:" : "Locked until:"
      }</strong> ${data.lockedUntil}</p>
      <p>${
        i18n.getLanguage() === "de"
          ? "Nach diesem Zeitpunkt können Sie sich wieder normal anmelden."
          : "After this time, you can log in normally again."
      }</p>
      <p>${
        i18n.getLanguage() === "de"
          ? "Falls Sie diese Anmeldeversuche nicht selbst durchgeführt haben, empfehlen wir Ihnen:"
          : "If you did not make these login attempts, we recommend:"
      }</p>
      <ul>
        ${
          i18n.getLanguage() === "de"
            ? `<li>Ändern Sie Ihr Passwort, sobald Ihr Konto entsperrt ist</li>
             <li>Aktivieren Sie die Zwei-Faktor-Authentifizierung</li>
             <li>Kontaktieren Sie unseren Support bei verdächtigen Aktivitäten</li>`
            : `<li>Change your password once your account is unlocked</li>
             <li>Enable two-factor authentication</li>
             <li>Contact our support for suspicious activities</li>`
        }
      </ul>
      <p>${support}</p>
    `,
      {
        doNotReply: i18n.t("email.footer.doNotReply"),
        copyright: i18n.t("email.footer.copyright", {
          year: new Date().getFullYear(),
        }),
      }
    );

    const text = `${subject}

${greeting},

${i18n.t("auth.login.accountLocked")}

${i18n.getLanguage() === "de" ? "Gesperrt bis:" : "Locked until:"} ${
      data.lockedUntil
    }

${support}

${appConfig.name}`;

    return { html, text, subject };
  },

  twoFactorCode: (data, i18n) => {
    const subject =
      i18n.getLanguage() === "de"
        ? "Ihr Sicherheitscode"
        : "Your Security Code";
    const greeting = i18n.t("email.greeting", { userName: data.userName });
    const expiresIn = i18n.t("email.expiresIn", { time: data.expiresIn });
    const securityNotice = i18n.t("email.securityNotice");

    const html = baseTemplate(
      `
      <h1>${subject}</h1>
      <p>${greeting},</p>
      <p>${
        i18n.getLanguage() === "de"
          ? "Hier ist Ihr Sicherheitscode für die Anmeldung:"
          : "Here is your security code for login:"
      }</p>
      <div class="code">${data.code}</div>
      <p>${expiresIn}</p>
      <div class="warning">
        <p><strong>${securityNotice}:</strong> ${
        i18n.getLanguage() === "de"
          ? "Geben Sie diesen Code niemals an andere weiter. Unser Support-Team wird Sie niemals nach diesem Code fragen."
          : "Never share this code with others. Our support team will never ask for this code."
      }</p>
      </div>
    `,
      {
        doNotReply: i18n.t("email.footer.doNotReply"),
        copyright: i18n.t("email.footer.copyright", {
          year: new Date().getFullYear(),
        }),
      }
    );

    const text = `${subject}

${greeting},

${
  i18n.getLanguage() === "de" ? "Ihr Sicherheitscode:" : "Your security code:"
} ${data.code}

${expiresIn}

${
  i18n.getLanguage() === "de"
    ? "WICHTIG: Geben Sie diesen Code niemals an andere weiter."
    : "IMPORTANT: Never share this code with others."
}

${appConfig.name}`;

    return { html, text, subject };
  },

  twoFactorEnabled: (data, i18n) => {
    const subject = i18n.t("email.twoFactorEnabled.subject");
    const greeting = i18n.t("email.greeting", { userName: data.userName });
    const support = i18n.t("email.support", { email: data.supportEmail });

    const html = baseTemplate(
      `
      <h1>${subject}</h1>
      <p>${greeting},</p>
      <p>${
        i18n.getLanguage() === "de"
          ? "Die Zwei-Faktor-Authentifizierung (2FA) wurde erfolgreich für Ihr Konto aktiviert."
          : "Two-Factor Authentication (2FA) has been successfully enabled for your account."
      }</p>
      
      <div style="background-color: #d1fae5; border: 1px solid #6ee7b7; padding: 20px; border-radius: 6px; margin: 20px 0;">
        <p style="margin: 0; color: #047857;">✅ ${
          i18n.getLanguage() === "de"
            ? "Ihr Konto ist jetzt zusätzlich geschützt!"
            : "Your account is now extra secure!"
        }</p>
      </div>
      
      <h3>${
        i18n.getLanguage() === "de"
          ? "Was bedeutet das für Sie?"
          : "What does this mean for you?"
      }</h3>
      <ul>
        ${
          i18n.getLanguage() === "de"
            ? `<li>Bei jeder Anmeldung benötigen Sie zusätzlich einen 6-stelligen Code aus Ihrer Authenticator-App</li>
             <li>Nur Sie haben Zugriff auf Ihr Konto, selbst wenn jemand Ihr Passwort kennt</li>
             <li>Bewahren Sie Ihre Backup-Codes sicher auf für den Notfall</li>`
            : `<li>You'll need a 6-digit code from your authenticator app for each login</li>
             <li>Only you can access your account, even if someone knows your password</li>
             <li>Keep your backup codes safe for emergencies</li>`
        }
      </ul>
      
      <div class="warning">
        <p><strong>${
          i18n.getLanguage() === "de" ? "Wichtiger Hinweis:" : "Important Note:"
        }</strong></p>
        <p>${
          i18n.getLanguage() === "de"
            ? "Falls Sie diese Änderung nicht vorgenommen haben, kontaktieren Sie umgehend unseren Support!"
            : "If you did not make this change, contact our support immediately!"
        }</p>
      </div>
      
      <p>${support}</p>
    `,
      {
        doNotReply: i18n.t("email.footer.doNotReply"),
        copyright: i18n.t("email.footer.copyright", {
          year: new Date().getFullYear(),
        }),
      }
    );

    const text = `${subject}

${greeting},

${
  i18n.getLanguage() === "de"
    ? "Die Zwei-Faktor-Authentifizierung wurde für Ihr Konto aktiviert."
    : "Two-Factor Authentication has been enabled for your account."
}

${
  i18n.getLanguage() === "de"
    ? "Falls Sie diese Änderung nicht vorgenommen haben, kontaktieren Sie umgehend unseren Support!"
    : "If you did not make this change, contact our support immediately!"
}

${support}

${appConfig.name}`;

    return { html, text, subject };
  },

  twoFactorDisabled: (data, i18n) => {
    const subject = i18n.t("email.twoFactorDisabled.subject");
    const greeting = i18n.t("email.greeting", { userName: data.userName });
    const support = i18n.t("email.support", { email: data.supportEmail });

    const html = baseTemplate(
      `
      <h1>${subject}</h1>
      <p>${greeting},</p>
      <p>${
        i18n.getLanguage() === "de"
          ? "Die Zwei-Faktor-Authentifizierung (2FA) wurde für Ihr Konto deaktiviert."
          : "Two-Factor Authentication (2FA) has been disabled for your account."
      }</p>
      
      <div style="background-color: #fef3c7; border: 1px solid #fbbf24; padding: 20px; border-radius: 6px; margin: 20px 0;">
        <p style="margin: 0; color: #92400e;">⚠️ ${
          i18n.getLanguage() === "de"
            ? "Ihr Konto ist jetzt weniger geschützt"
            : "Your account is now less secure"
        }</p>
      </div>
      
      <p>${
        i18n.getLanguage() === "de"
          ? "Ohne 2FA ist Ihr Konto nur durch Ihr Passwort geschützt. Wir empfehlen dringend, 2FA wieder zu aktivieren, um die Sicherheit Ihres Kontos zu erhöhen."
          : "Without 2FA, your account is only protected by your password. We strongly recommend re-enabling 2FA to increase your account security."
      }</p>
      
      <div class="warning">
        <p><strong>${
          i18n.getLanguage() === "de"
            ? "Wichtiger Sicherheitshinweis:"
            : "Important Security Notice:"
        }</strong></p>
        <p>${
          i18n.getLanguage() === "de"
            ? "Falls Sie diese Änderung nicht vorgenommen haben, wurde Ihr Konto möglicherweise kompromittiert. Ändern Sie sofort Ihr Passwort und kontaktieren Sie unseren Support!"
            : "If you did not make this change, your account may have been compromised. Change your password immediately and contact our support!"
        }</p>
      </div>
      
      <p>${support}</p>
    `,
      {
        doNotReply: i18n.t("email.footer.doNotReply"),
        copyright: i18n.t("email.footer.copyright", {
          year: new Date().getFullYear(),
        }),
      }
    );

    const text = `${subject}

${greeting},

${
  i18n.getLanguage() === "de"
    ? "Die Zwei-Faktor-Authentifizierung wurde für Ihr Konto deaktiviert."
    : "Two-Factor Authentication has been disabled for your account."
}

${
  i18n.getLanguage() === "de"
    ? "WARNUNG: Falls Sie diese Änderung nicht vorgenommen haben, ändern Sie sofort Ihr Passwort und kontaktieren Sie unseren Support!"
    : "WARNING: If you did not make this change, change your password immediately and contact our support!"
}

${support}

${appConfig.name}`;

    return { html, text, subject };
  },
};

export async function renderTemplate(
  template: EmailTemplate,
  data: any,
  language: SupportedLanguage = "en"
): Promise<RenderedEmail> {
  const i18n = new I18nService(language);
  const templateFn = templates[template];

  if (!templateFn) {
    throw new Error(`Unknown email template: ${template}`);
  }

  return templateFn(data, i18n);
}
