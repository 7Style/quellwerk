import { IAuthEmailSender } from "../../interfaces/email-sender.interface.js";
import { IEmailAdapter, EmailOptions, EmailTemplate } from "../../interfaces/module.interface.js";
import { authEmailNotificationsConfig as cfg } from "../../configs/email-notifications.config.js";
import { sendEmailVerification } from './html-templates/email-verification.html.js';
import { sendPasswordReset } from './html-templates/password-reset.html.js';
import { sendWelcome } from './html-templates/welcome.html.js';
import { sendTwoFactorEnabled } from './html-templates/twofactor-enabled.html.js';
import { sendTwoFactorDisabled } from './html-templates/twofactor-disabled.html.js';
import { sendTwoFactorCode } from './html-templates/twofactor-code.html.js';
import { sendOneTimePassword } from './html-templates/one-time-password.html.js';
import { sendAccountLocked } from './html-templates/account-locked.html.js';

type LoggerLike = {
    info: (...args: any[]) => void;
    warn: (...args: any[]) => void;
    error: (...args: any[]) => void;
    debug?: (...args: any[]) => void;
};

export class EmailService implements IAuthEmailSender {
    private readonly fromAddress: string;
    private readonly logger: LoggerLike;

    constructor(private emailSender: IEmailAdapter, opts?: { from?: string; logger?: LoggerLike }) {
        this.fromAddress = opts?.from || cfg.from;
        // Try to get logger from adapter, fallback to provided logger, then console
        const adapterLogger = (emailSender as any)?.logger as LoggerLike | undefined;
        this.logger = adapterLogger || opts?.logger || console;
    }

    async sendEmail(options: EmailOptions): Promise<void> {
        try {
            // Ensure subject/html if a template was requested
            if (options.template && !options.html) {
                const rendered = this.render(options.template, options.data || {});
                options.subject = options.subject || rendered.subject;
                options.html = rendered.html;
                options.text = options.text || rendered.text;
            }
            // Ensure from
            options.from = options.from || this.fromAddress;

            await this.emailSender.sendEmail(options);
            this.logger.info?.('AuthEmailService: email sent', { to: options.to, subject: options.subject });
        } catch (err) {
            this.logger.error?.('AuthEmailService: email send failed', { to: options.to, subject: options.subject, err });
            throw err;
        }
    }

    async sendEmailVerificationNotification(email: string, token: string): Promise<void> {
        const r = this.render('emailVerification', { token });
        await this.sendEmail({ to: email, subject: r.subject, html: r.html, text: r.text, from: this.fromAddress });
    }

    async sendWelcomeNotification(email: string, token: string): Promise<void> {
        const r = this.render('welcome', { token });
        await this.sendEmail({ to: email, subject: r.subject, html: r.html, text: r.text, from: this.fromAddress });
    }

    async sendPasswordResetNotification(email: string, token: string): Promise<void> {
        const r = this.render('passwordReset', { token });
        await this.sendEmail({ to: email, subject: r.subject, html: r.html, text: r.text, from: this.fromAddress });
    }

    async sendAccountLockedNotification(email: string, token: string): Promise<void> {
        const r = this.render('accountLocked', { token });
        await this.sendEmail({ to: email, subject: r.subject, html: r.html, text: r.text, from: this.fromAddress });
    }

    async sendTwoFactorCodeNotification(email: string, code: string): Promise<void> {
        const r = this.render('twoFactorCode', { code });
        await this.sendEmail({ to: email, subject: r.subject, html: r.html, text: r.text, from: this.fromAddress });
    }

    async sendTwoFactorEnabledNotification(email: string, token: string): Promise<void> {
        const r = this.render('twoFactorEnabled', { token });
        await this.sendEmail({ to: email, subject: r.subject, html: r.html, text: r.text, from: this.fromAddress });
    }

    async sendTwoFactorDisabledNotification(email: string, token: string): Promise<void> {
        const r = this.render('twoFactorDisabled', { token });
        await this.sendEmail({ to: email, subject: r.subject, html: r.html, text: r.text, from: this.fromAddress });
    }

    async sendOneTimePasswordCode(email: string, code: string, deepLinkUrl?: string): Promise<void> {
        const r = this.render('oneTimePasswordCode', { code, deepLinkUrl });
        await this.sendEmail({ to: email, subject: r.subject, html: r.html, text: r.text, from: this.fromAddress });
    }

    private render(template: EmailTemplate, data: Record<string, any>) {
        const FRONTEND_URL = cfg.urls.frontend;
        switch (template) {
            case 'emailVerification': {
                const link = data.verificationUrl || `${FRONTEND_URL}/verify-email.html?token=${data.token}`;
                return { subject: cfg.templates.emailVerification.subject, html: sendEmailVerification({ link, userName: data.userName }) };
            }
            case 'passwordReset': {
                const link = data.resetUrl || `${FRONTEND_URL}/reset-password?token=${data.token}`;
                return { subject: cfg.templates.passwordReset.subject, html: sendPasswordReset({ link, userName: data.userName }) };
            }
            case 'welcome': {
                return { subject: cfg.templates.welcome.subject, html: sendWelcome({ loginUrl: `${FRONTEND_URL}/auth.html`, userName: data.userName, temporaryPassword: data.temporaryPassword }) };
            }
            case 'twoFactorEnabled': {
                return { subject: cfg.templates.twoFactorEnabled.subject, html: sendTwoFactorEnabled({ userName: data.userName }) };
            }
            case 'twoFactorDisabled': {
                return { subject: cfg.templates.twoFactorDisabled.subject, html: sendTwoFactorDisabled({ userName: data.userName }) };
            }
            case 'twoFactorCode': {
                return { subject: cfg.templates.twoFactorCode.subject, html: sendTwoFactorCode({ code: String(data.code || ''), userName: data.userName }), text: `Dein 2FA‑Code: ${data.code}` };
            }
            case 'oneTimePasswordCode': {
                const text = [`Dein Einmalpasswort lautet: ${data.code}`];
                if (data.deepLinkUrl) {
                    text.push(`Direkt einloggen: ${data.deepLinkUrl}`);
                }
                return {
                    subject: cfg.templates.oneTimePasswordCode.subject,
                    html: sendOneTimePassword({
                        code: String(data.code || ''),
                        userName: data.userName,
                        deepLinkUrl: data.deepLinkUrl,
                    }),
                    text: text.join('\n'),
                };
            }
            case 'accountLocked': {
                return { subject: cfg.templates.accountLocked.subject, html: sendAccountLocked({ untilText: data.untilText, userName: data.userName }) };
            }
            default:
                return { subject: cfg.templates.custom.subject, html: sendWelcome({ loginUrl: `${FRONTEND_URL}/auth.html` }) };
        }
    }
}
