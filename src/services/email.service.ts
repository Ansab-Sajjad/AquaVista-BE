import nodemailer from "nodemailer";
import logger from "../config/logger";

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: parseInt(process.env.SMTP_PORT || "587", 10),
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

const FROM = `"${process.env.EMAIL_FROM_NAME || "AquaVista"}" <${process.env.EMAIL_FROM || "noreply@aquavista.dev"}>`;
const FE_URL = process.env.FRONTEND_URL || "http://localhost:3000";

export async function sendActivationEmail(to: string, name: string, token: string) {
  const link = `${FE_URL}/auth/activate?token=${token}`;
  await transporter.sendMail({
    from: FROM,
    to,
    subject: "Activate your AquaVista account",
    html: `
      <p>Hi ${name},</p>
      <p>You've been invited to AquaVista. Click the link below to set your password and activate your account.</p>
      <p><a href="${link}">${link}</a></p>
      <p>This link expires in ${process.env.ACTIVATION_TOKEN_EXPIRES_HOURS || 168} hours.</p>
    `,
  });
  logger.info(`Activation email sent to ${to}`);
}

export async function sendPasswordResetEmail(to: string, name: string, token: string) {
  const link = `${FE_URL}/auth/password-new?token=${token}`;
  await transporter.sendMail({
    from: FROM,
    to,
    subject: "Reset your AquaVista password",
    html: `
      <p>Hi ${name},</p>
      <p>We received a request to reset your password. Click the link below to set a new password.</p>
      <p><a href="${link}">${link}</a></p>
      <p>This link expires in 1 hour. If you didn't request this, you can ignore this email.</p>
    `,
  });
  logger.info(`Password reset email sent to ${to}`);
}
