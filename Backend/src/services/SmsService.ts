import axios from 'axios';
import config from '../config';
import logger from '../utils/logger';

interface SendSmsInput {
  phoneNumber: string;
  token: string;
  expiresMinutes: number;
  displayName?: string;
}

class SmsService {
  private isTwilioConfigured(): boolean {
    return Boolean(
      config.sms.enabled &&
      config.sms.provider === 'twilio' &&
      config.sms.twilio.accountSid &&
      config.sms.twilio.authToken &&
      config.sms.twilio.fromNumber
    );
  }

  private isTwoFactorConfigured(): boolean {
    return Boolean(
      config.sms.enabled &&
      config.sms.provider === '2factor' &&
      config.sms.twofactor.apiKey
    );
  }

  private shouldThrowOnDeliveryFailure(): boolean {
    return config.sms.strict || config.server.env === 'production';
  }

  private normalizePhone(phone: string): string {
    const digits = phone.replace(/\D/g, '');
    return digits.startsWith('91') ? `+${digits}` : `+91${digits}`;
  }

  private normalizePhoneForTwoFactor(phone: string): string {
    const digits = phone.replace(/\D/g, '');
    return digits.startsWith('91') ? digits : `91${digits}`;
  }

  async sendLoginOtpSms({ phoneNumber, token, expiresMinutes, displayName }: SendSmsInput): Promise<void> {
    if (!config.sms.enabled) {
      logger.info(`SMS suppressed (SMS_ENABLED=false): phone=${phoneNumber}, token=${token}`);
      return;
    }

    if (config.sms.provider === '2factor') {
      await this.sendViaTwoFactor({ phoneNumber, token });
      return;
    }

    if (config.sms.provider === 'twilio') {
      await this.sendViaTwilio({ phoneNumber, token, expiresMinutes, displayName });
      return;
    }

    const message = `Unsupported SMS provider "${config.sms.provider}"`;
    if (this.shouldThrowOnDeliveryFailure()) {
      throw new Error(message);
    }
    logger.warn(`${message}. OTP token (dev fallback): ${token}`);
  }

  private async sendViaTwilio({ phoneNumber, token, expiresMinutes, displayName }: SendSmsInput): Promise<void> {
    if (!this.isTwilioConfigured()) {
      const message = `Twilio SMS transport not configured; unable to send OTP SMS to ${phoneNumber}`;
      if (this.shouldThrowOnDeliveryFailure()) {
        throw new Error(message);
      }
      logger.warn(`${message}. OTP token (dev fallback): ${token}`);
      return;
    }

    const to = this.normalizePhone(phoneNumber);
    const body = `Hi ${displayName || 'Voter'}, your Janadesh OTP is ${token}. It expires in ${expiresMinutes} minutes.`;
    const endpoint = `https://api.twilio.com/2010-04-01/Accounts/${config.sms.twilio.accountSid}/Messages.json`;
    const payload = new URLSearchParams({
      To: to,
      From: config.sms.twilio.fromNumber,
      Body: body,
    });

    try {
      const response = await axios.post(endpoint, payload, {
        auth: {
          username: config.sms.twilio.accountSid,
          password: config.sms.twilio.authToken,
        },
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      });

      logger.info(`SMS sent successfully: sid=${response.data?.sid || 'unknown'}, to=${to}`);
    } catch (error: any) {
      const errorMessage = `Failed to send SMS to ${to}: ${error?.response?.data?.message || error?.message || 'Unknown error'}`;
      if (this.shouldThrowOnDeliveryFailure()) {
        throw new Error(errorMessage);
      }
      logger.error(`${errorMessage}. OTP token (dev fallback): ${token}`);
    }
  }

  private async sendViaTwoFactor({ phoneNumber, token }: { phoneNumber: string; token: string }): Promise<void> {
    if (!this.isTwoFactorConfigured()) {
      const message = `2Factor SMS transport not configured; unable to send OTP SMS to ${phoneNumber}`;
      if (this.shouldThrowOnDeliveryFailure()) {
        throw new Error(message);
      }
      logger.warn(`${message}. OTP token (dev fallback): ${token}`);
      return;
    }

    const phone = this.normalizePhoneForTwoFactor(phoneNumber);
    const templateName = config.sms.twofactor.templateName?.trim();
    const endpoint = templateName
      ? `https://2factor.in/API/V1/${config.sms.twofactor.apiKey}/SMS/${phone}/${token}/${encodeURIComponent(templateName)}`
      : `https://2factor.in/API/V1/${config.sms.twofactor.apiKey}/SMS/${phone}/${token}`;

    try {
      const response = await axios.get(endpoint);
      const status = response.data?.Status || response.data?.status || 'unknown';
      if (String(status).toLowerCase() !== 'success') {
        throw new Error(response.data?.Details || response.data?.message || '2Factor API request failed');
      }

      logger.info(`2Factor SMS sent successfully: phone=${phone}, details=${response.data?.Details || 'ok'}`);
    } catch (error: any) {
      const errorMessage = `Failed to send 2Factor SMS to ${phone}: ${error?.response?.data?.Details || error?.message || 'Unknown error'}`;
      if (this.shouldThrowOnDeliveryFailure()) {
        throw new Error(errorMessage);
      }
      logger.error(`${errorMessage}. OTP token (dev fallback): ${token}`);
    }
  }
}

export default new SmsService();
