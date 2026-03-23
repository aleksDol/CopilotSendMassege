import nodemailer from "nodemailer";
import type { FastifyInstance } from "fastify";
import { AppError } from "./errors.js";

type SendEmailParams = {
  to: string;
  subject: string;
  text: string;
};

export class EmailService {
  private readonly transporter: nodemailer.Transporter;
  private readonly from: string;

  constructor(private readonly app: FastifyInstance) {
    const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_SECURE, EMAIL_FROM } = app.config.env;

    if (!SMTP_HOST || !SMTP_PORT || !SMTP_USER || !SMTP_PASS || !EMAIL_FROM) {
      throw new AppError(500, "EMAIL_CONFIG_MISSING", "Email provider is not configured");
    }

    this.from = EMAIL_FROM;
    this.transporter = nodemailer.createTransport({
      host: SMTP_HOST,
      port: SMTP_PORT,
      secure: SMTP_SECURE,
      auth: {
        user: SMTP_USER,
        pass: SMTP_PASS
      }
    });
  }

  async send(params: SendEmailParams): Promise<void> {
    if (this.app.config.env.NODE_ENV === "test") {
      return;
    }

    try {
      await this.transporter.sendMail({
        from: this.from,
        to: params.to,
        subject: params.subject,
        text: params.text
      });
    } catch (error) {
      this.app.log.error({ err: error, to: params.to }, "Failed to send email");
      throw new AppError(500, "EMAIL_SEND_FAILED", "Failed to send verification code");
    }
  }
}
