import nodemailer from 'nodemailer';
import { config } from '../config.js';
import { logger } from '../logger.js';

let transporter = null;

export function mailConfigured() {
  return Boolean(config.smtp.host);
}

function getTransporter() {
  if (transporter) return transporter;
  const { host, port, secure, user, password } = config.smtp;
  transporter = nodemailer.createTransport({
    host,
    port,
    secure: secure === 'ssl',
    ignoreTLS: secure === 'none',
    requireTLS: secure === 'starttls',
    auth: user ? { user, pass: password } : undefined,
  });
  return transporter;
}

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/**
 * Emails a coordinator their new temporary password.
 * Returns { sent: boolean, error?: string } — never throws, so a mail outage
 * does not undo the password reset.
 */
export async function sendPasswordResetMail({ to, name, departmentName, tempPassword }) {
  if (!mailConfigured()) return { sent: false, error: 'Email is not configured (SMTP_HOST is empty)' };
  const loginUrl = `${config.appUrl.replace(/\/$/, '')}/login`;
  const dept = departmentName ? ` (${departmentName})` : '';
  const text = [
    `Dear ${name}${dept},`,
    '',
    'Your password for the CUJ Exam Date Sheet system has been reset by the Exam Cell.',
    '',
    `Login: ${loginUrl}`,
    `Email: ${to}`,
    `Temporary password: ${tempPassword}`,
    '',
    'You will be asked to choose a new password the first time you sign in.',
    '',
    'Regards,',
    'Examination Cell, Central University of Jammu',
  ].join('\n');
  const html = `<div style="font-family:Arial,sans-serif;font-size:14px;color:#1f2937;max-width:520px">
  <h2 style="color:#1e3a8a;margin:0 0 12px">Password reset</h2>
  <p>Dear ${esc(name)}${esc(dept)},</p>
  <p>Your password for the <strong>CUJ Exam Date Sheet</strong> system has been reset by the Exam Cell.</p>
  <table style="border-collapse:collapse;margin:12px 0">
    <tr><td style="padding:4px 12px 4px 0;color:#6b7280">Login</td><td><a href="${esc(loginUrl)}">${esc(loginUrl)}</a></td></tr>
    <tr><td style="padding:4px 12px 4px 0;color:#6b7280">Email</td><td>${esc(to)}</td></tr>
    <tr><td style="padding:4px 12px 4px 0;color:#6b7280">Temporary password</td><td><code style="background:#f3f4f6;padding:2px 6px;border-radius:4px;font-size:15px">${esc(tempPassword)}</code></td></tr>
  </table>
  <p>You will be asked to choose a new password the first time you sign in.</p>
  <p style="color:#6b7280">Examination Cell, Central University of Jammu</p>
</div>`;
  try {
    await getTransporter().sendMail({
      from: config.smtp.from, to, subject: 'CUJ Exam Date Sheet – your password has been reset', text, html,
    });
    return { sent: true };
  } catch (err) {
    logger.error({ err: err.message, to }, 'Failed to send password reset email');
    return { sent: false, error: err.message };
  }
}
