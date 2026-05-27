import nodemailer, { Transporter } from 'nodemailer';
import config from '../config';
import logger from '../utils/logger';

interface SendOtpEmailInput {
  email: string;
  token: string;
  expiresMinutes: number;
  displayName?: string;
}

class EmailService {
  private transporter: Transporter | null = null;

  constructor() {
    const { enabled, smtp } = config.email;
    const hasSmtpConfig = Boolean(smtp.host && smtp.user && smtp.pass && config.email.fromEmail);

    if (!enabled) {
      logger.info('Email service disabled by configuration');
      return;
    }

    if (!hasSmtpConfig) {
      logger.warn('Email service enabled but SMTP config is incomplete; falling back to log-only mode');
      return;
    }

    this.transporter = nodemailer.createTransport({
      host: smtp.host,
      port: smtp.port,
      secure: smtp.secure,
      auth: {
        user: smtp.user,
        pass: smtp.pass,
      },
    });
  }

  private shouldThrowOnDeliveryFailure(): boolean {
    return config.email.strict || config.server.env === 'production';
  }

  private getRecipientName(displayName?: string): string {
    return displayName?.trim() || 'Voter';
  }

  private async sendEmail(to: string, subject: string, text: string, html: string, debugToken?: string): Promise<void> {
    if (!config.email.enabled) {
      logger.info(`Email suppressed (EMAIL_ENABLED=false): to=${to}, subject="${subject}", token=${debugToken || 'n/a'}`);
      return;
    }

    if (!this.transporter) {
      const message = `SMTP transport not configured; unable to send email to ${to}`;
      if (this.shouldThrowOnDeliveryFailure()) {
        throw new Error(message);
      }
      logger.warn(`${message}. OTP token (dev fallback): ${debugToken || 'n/a'}`);
      return;
    }

    try {
      const info = await this.transporter.sendMail({
        from: config.email.fromEmail,
        to,
        subject,
        text,
        html,
      });
      logger.info(`Email sent successfully: messageId=${info.messageId}, to=${to}`);
    } catch (error: any) {
      const errorMessage = `Failed to send email to ${to}: ${error?.message || 'Unknown error'}`;
      if (this.shouldThrowOnDeliveryFailure()) {
        throw new Error(errorMessage);
      }
      logger.error(`${errorMessage}. OTP token (dev fallback): ${debugToken || 'n/a'}`);
    }
  }

  async sendVerificationEmail({ email, token, expiresMinutes, displayName }: SendOtpEmailInput): Promise<void> {
    const recipient = this.getRecipientName(displayName);
    const subject = 'Verify Your Janadesh Account';
    const text = [
      `Hello ${recipient},`,
      '',
      `Your Janadesh account verification code is: ${token}`,
      `This code expires in ${expiresMinutes} minutes.`,
      '',
      'If you did not register, please ignore this email.',
    ].join('\n');
    const html = `
      <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #0f172a;">
        <h2 style="margin-bottom: 8px;">Janadesh Account Verification</h2>
        <p>Hello ${recipient},</p>
        <p>Your verification code is:</p>
        <div style="font-size: 24px; font-weight: 700; letter-spacing: 2px; margin: 12px 0;">${token}</div>
        <p>This code expires in <strong>${expiresMinutes} minutes</strong>.</p>
        <p>If you did not register, please ignore this email.</p>
      </div>
    `;
    await this.sendEmail(email, subject, text, html, token);
  }

  async sendLoginOtpEmail({ email, token, expiresMinutes, displayName }: SendOtpEmailInput): Promise<void> {
    const recipient = this.getRecipientName(displayName);
    const subject = 'Your Janadesh Login OTP';
    const text = [
      `Hello ${recipient},`,
      '',
      `Your Janadesh login OTP is: ${token}`,
      `This OTP expires in ${expiresMinutes} minutes.`,
      '',
      'If this was not you, please secure your account immediately.',
    ].join('\n');
    const html = `
      <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #0f172a;">
        <h2 style="margin-bottom: 8px;">Janadesh Login OTP</h2>
        <p>Hello ${recipient},</p>
        <p>Your OTP is:</p>
        <div style="font-size: 24px; font-weight: 700; letter-spacing: 2px; margin: 12px 0;">${token}</div>
        <p>This OTP expires in <strong>${expiresMinutes} minutes</strong>.</p>
        <p>If this was not you, please secure your account immediately.</p>
      </div>
    `;
    await this.sendEmail(email, subject, text, html, token);
  }
}

export default new EmailService();
