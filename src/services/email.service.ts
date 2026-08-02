import nodemailer from "nodemailer";
import logger from "../config/logger";

const gmailUser =
  process.env.GMAIL_USER ||
  process.env.SMTP_USER;

const gmailAppPassword =
  process.env.GMAIL_APP_PASSWORD ||
  process.env.GMAIL_PASS ||
  process.env.SMTP_PASS;

const fromEmail =
  process.env.EMAIL_FROM ||
  gmailUser ||
  "noreply@aquavista.dev";

const fromName = process.env.EMAIL_FROM_NAME || "AquaVista";
const FE_URL = process.env.FRONTEND_URL || "http://localhost:3000";

function createTransport() {
  if (gmailUser && gmailAppPassword) {
    const port = parseInt(process.env.GMAIL_PORT || "587", 10);
    return nodemailer.createTransport({
      host: "smtp.gmail.com",
      port,
      secure: port === 465,
      auth: {
        user: gmailUser,
        pass: gmailAppPassword,
      },
    });
  }

  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT || "587", 10),
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });
}

const transporter = createTransport();
const FROM = `"${fromName}" <${fromEmail}>`;

function escapeHtml(value: string) {
  return value.replace(
    /[&<>'"]/g,
    (character) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        "'": "&#39;",
        '"': "&quot;",
      })[character] || character,
  );
}

function emailLayout({
  name,
  preheader,
  eyebrow,
  title,
  body,
  link,
  buttonLabel,
  expiry,
  footer,
}: {
  name: string;
  preheader: string;
  eyebrow: string;
  title: string;
  body: string;
  link: string;
  buttonLabel: string;
  expiry: string;
  footer: string;
}) {
  const safeName = escapeHtml(name);
  const safeLink = escapeHtml(link);

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${escapeHtml(title)}</title>
  </head>
  <body style="margin:0;background:#f5f7f8;color:#263238;font-family:Mulish,Arial,sans-serif;">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(preheader)}</div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f5f7f8;padding:32px 16px;">
      <tr><td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;">
          <tr><td style="padding:0 8px 24px;">
            <div style="font-family:Urbanist,Arial,sans-serif;font-size:24px;font-weight:800;letter-spacing:.2px;color:#263238;">
              Aqua<span style="color:#f8a52d;">Vista</span>
            </div>
          </td></tr>
          <tr><td style="background:#ffffff;border:1px solid #e3e8eb;border-radius:8px;overflow:hidden;">
            <div style="height:6px;background:#f8a52d;font-size:0;line-height:0;">&nbsp;</div>
            <div style="padding:40px 40px 36px;">
              <div style="font-size:12px;line-height:18px;font-weight:700;letter-spacing:1.4px;text-transform:uppercase;color:#6b7c85;">${escapeHtml(eyebrow)}</div>
              <h1 style="margin:12px 0 16px;font-family:Urbanist,Arial,sans-serif;font-size:30px;line-height:38px;color:#263238;">${escapeHtml(title)}</h1>
              <p style="margin:0 0 16px;font-size:16px;line-height:26px;">Hi ${safeName},</p>
              <p style="margin:0 0 28px;font-size:16px;line-height:26px;">${body}</p>
              <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 24px;"><tr><td style="border-radius:6px;background:#f8a52d;">
                <a href="${safeLink}" style="display:inline-block;padding:14px 24px;border:1px solid #f8a52d;border-radius:6px;color:#263238;font-size:15px;font-weight:700;line-height:20px;text-decoration:none;">${escapeHtml(buttonLabel)}</a>
              </td></tr></table>
              <p style="margin:0 0 8px;font-size:13px;line-height:21px;color:#6b7c85;">${escapeHtml(expiry)}</p>
              <p style="margin:0;font-size:13px;line-height:21px;color:#6b7c85;">If the button does not work, copy and paste this link into your browser:<br><a href="${safeLink}" style="color:#2387a6;word-break:break-all;">${safeLink}</a></p>
            </div>
          </td></tr>
          <tr><td style="padding:24px 8px 0;font-size:12px;line-height:20px;color:#809099;">${escapeHtml(footer)}<br>Sent by AquaVista</td></tr>
        </table>
      </td></tr>
    </table>
  </body>
</html>`;
}

export async function sendActivationEmail(to: string, name: string, token: string) {
  const link = `${FE_URL}/auth/activate?token=${token}`;
  const activationHours = process.env.ACTIVATION_TOKEN_EXPIRES_HOURS || "168";
  await transporter.sendMail({
    from: FROM,
    to,
    subject: "Activate your AquaVista account",
    text: `Hi ${name},\n\nYou've been invited to AquaVista. Set your password and activate your account here:\n${link}\n\nThis link expires in ${activationHours} hours.`,
    html: emailLayout({
      name,
      preheader: "Finish setting up your AquaVista account.",
      eyebrow: "Welcome to AquaVista",
      title: "Activate your account",
      body: "You've been invited to AquaVista. Set your password to finish creating your account and start managing your rate-study projects.",
      link,
      buttonLabel: "Activate account",
      expiry: `This link expires in ${activationHours} hours.`,
      footer: "You received this message because an AquaVista account was created with this email address.",
    }),
  });
  logger.info(`Activation email sent to ${to}`);
}

export async function sendPasswordResetEmail(to: string, name: string, token: string) {
  const link = `${FE_URL}/auth/password-new?token=${token}`;
  const resetHours = process.env.RESET_TOKEN_EXPIRES_HOURS || "1";
  await transporter.sendMail({
    from: FROM,
    to,
    subject: "Reset your AquaVista password",
    text: `Hi ${name},\n\nWe received a request to reset your AquaVista password. Set a new password here:\n${link}\n\nThis link expires in ${resetHours} hour${resetHours === "1" ? "" : "s"}. If you didn't request this, you can ignore this email.`,
    html: emailLayout({
      name,
      preheader: "A request was made to reset your AquaVista password.",
      eyebrow: "Account security",
      title: "Reset your password",
      body: "We received a request to reset your AquaVista password. Choose a new password using the secure link below.",
      link,
      buttonLabel: "Reset password",
      expiry: `This link expires in ${resetHours} hour${resetHours === "1" ? "" : "s"}. If you didn't request this, you can ignore this email.`,
      footer: "For your security, never share this link with anyone else.",
    }),
  });
  logger.info(`Password reset email sent to ${to}`);
}
