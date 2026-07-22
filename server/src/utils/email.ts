import nodemailer from 'nodemailer';
import { config } from '../config/environment';
import { logger } from './logger';

const transporter = nodemailer.createTransport({
  host: config.smtp.host,
  port: config.smtp.port,
  secure: config.smtp.secure,
  auth: config.smtp.user ? {
    user: config.smtp.user,
    pass: config.smtp.pass,
  } : undefined,
  pool: true,
  maxConnections: 5,
  maxMessages: 100,
  rateDelta: 1000,
  rateLimit: 10,
});

const colors = {
  navy: '#0F172A',
  blue: '#0369A1',
  green: '#22C55E',
  red: '#EF4444',
  gray: '#64748B',
  lightGray: '#F1F5F9',
  white: '#FFFFFF',
  border: '#E2E8F0',
};

const baseStyles = `
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: ${colors.navy}; background-color: ${colors.lightGray}; }
    .email-wrapper { width: 100%; padding: 40px 20px; background-color: ${colors.lightGray}; }
    .email-container { max-width: 600px; margin: 0 auto; background-color: ${colors.white}; border-radius: 12px; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -2px rgba(0, 0, 0, 0.1); overflow: hidden; }
    .header { background: linear-gradient(135deg, ${colors.navy} 0%, ${colors.blue} 100%); padding: 32px 24px; text-align: center; }
    .header h1 { color: ${colors.white}; font-size: 24px; font-weight: 700; margin: 0; }
    .header p { color: rgba(255, 255, 255, 0.9); font-size: 14px; margin-top: 8px; }
    .content { padding: 32px 24px; }
    .content h2 { color: ${colors.navy}; font-size: 20px; font-weight: 600; margin-bottom: 16px; }
    .content p { color: ${colors.gray}; font-size: 15px; margin-bottom: 16px; }
    .button { display: inline-block; padding: 14px 28px; background: linear-gradient(135deg, ${colors.blue} 0%, ${colors.navy} 100%); color: ${colors.white}; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 14px; text-align: center; transition: all 0.2s ease; }
    .button:hover { transform: translateY(-1px); box-shadow: 0 4px 12px rgba(3, 105, 161, 0.4); }
    .button-secondary { background: linear-gradient(135deg, ${colors.gray} 0%, ${colors.navy} 100%); }
    .button-success { background: linear-gradient(135deg, ${colors.green} 0%, #16A34A 100%); }
    .button-danger { background: linear-gradient(135deg, ${colors.red} 0%, #DC2626 100%); }
    .divider { height: 1px; background-color: ${colors.border}; margin: 24px 0; }
    .info-grid { display: table; width: 100%; margin: 16px 0; }
    .info-row { display: table-row; }
    .info-label { display: table-cell; padding: 10px 0; color: ${colors.gray}; font-size: 14px; font-weight: 500; width: 40%; }
    .info-value { display: table-cell; padding: 10px 0; color: ${colors.navy}; font-size: 14px; font-weight: 600; text-align: right; }
    .badge { display: inline-block; padding: 6px 12px; border-radius: 20px; font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; }
    .badge-pending { background-color: #FEF3C7; color: #92400E; }
    .badge-approved { background-color: #DCFCE7; color: ${colors.green}; }
    .badge-rejected { background-color: #FEE2E2; color: ${colors.red}; }
    .badge-processing { background-color: #DBEAFE; color: ${colors.blue}; }
    .badge-completed { background-color: #F3F4F6; color: ${colors.navy}; }
    .footer { background-color: ${colors.lightGray}; padding: 24px; text-align: center; border-top: 1px solid ${colors.border}; }
    .footer p { color: ${colors.gray}; font-size: 12px; margin: 4px 0; }
    .footer a { color: ${colors.blue}; text-decoration: none; }
    .footer a:hover { text-decoration: underline; }
    .alert-box { padding: 16px; border-radius: 8px; margin: 16px 0; font-size: 14px; }
    .alert-info { background-color: #EFF6FF; border: 1px solid #BFDBFE; color: ${colors.blue}; }
    .alert-success { background-color: #F0FDF4; border: 1px solid #BBF7D0; color: ${colors.green}; }
    .alert-warning { background-color: #FFFBEB; border: 1px solid #FDE68A; color: #92400E; }
    .alert-error { background-color: #FEF2F2; border: 1px solid #FECACA; color: ${colors.red}; }
    .attachment-notice { background-color: ${colors.lightGray}; border: 1px dashed ${colors.border}; border-radius: 8px; padding: 16px; margin: 16px 0; text-align: center; color: ${colors.gray}; font-size: 13px; }
    @media only screen and (max-width: 480px) {
      .email-wrapper { padding: 20px 10px; }
      .content { padding: 24px 16px; }
      .header { padding: 24px 16px; }
      .button { width: 100%; }
      .info-label, .info-value { display: block; width: 100%; text-align: left; padding: 6px 0; }
      .info-value { text-align: left; margin-top: -4px; }
    }
  </style>
`;

function wrapEmail(content: string): string {
  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <meta name="x-apple-disable-message-reformatting">
      <title>HRFlow Pro</title>
      ${baseStyles}
    </head>
    <body>
      <div class="email-wrapper">
        <div class="email-container">
          <div class="header">
            <h1>HRFlow Pro</h1>
            <p>Human Resources Management Platform</p>
          </div>
          <div class="content">
            ${content}
          </div>
          <div class="footer">
            <p>This email was sent from HRFlow Pro</p>
            <p>&copy; ${new Date().getFullYear()} HRFlow Pro. All rights reserved.</p>
            <p><a href="${config.clientUrl}/unsubscribe">Unsubscribe</a> | <a href="${config.clientUrl}/privacy">Privacy Policy</a></p>
          </div>
        </div>
      </div>
    </body>
    </html>
  `;
}

export function welcomeEmail(data: {
  firstName: string;
  lastName: string;
  email: string;
  temporaryPassword?: string;
  loginUrl: string;
}): string {
  const content = `
    <h2>Welcome to HRFlow Pro, ${data.firstName}!</h2>
    <p>Your account has been created successfully. We're excited to have you on board.</p>
    
    <div class="info-grid">
      <div class="info-row">
        <span class="info-label">Name:</span>
        <span class="info-value">${data.firstName} ${data.lastName}</span>
      </div>
      <div class="info-row">
        <span class="info-label">Email:</span>
        <span class="info-value">${data.email}</span>
      </div>
    </div>
    
    ${data.temporaryPassword ? `
    <div class="alert-box alert-warning">
      <strong>Temporary Password:</strong> ${data.temporaryPassword}<br>
      Please log in and change your password immediately for security.
    </div>
    ` : ''}
    
    <div style="text-align: center; margin: 32px 0;">
      <a href="${data.loginUrl}" class="button">Access Your Account</a>
    </div>
    
    <div class="divider"></div>
    <p>If you have any questions, feel free to reach out to our support team.</p>
    <p>Best regards,<br>The HRFlow Pro Team</p>
  `;
  
  return wrapEmail(content);
}

export function leaveRequestEmail(data: {
  employeeName: string;
  employeeEmail: string;
  leaveType: string;
  startDate: string;
  endDate: string;
  daysCount: number;
  reason: string;
  requestUrl: string;
  approverName: string;
}): string {
  const content = `
    <h2>New Leave Request</h2>
    <p>Hello ${data.approverName},</p>
    <p><strong>${data.employeeName}</strong> has submitted a new leave request for your approval.</p>
    
    <div class="info-grid">
      <div class="info-row">
        <span class="info-label">Leave Type:</span>
        <span class="info-value">${data.leaveType}</span>
      </div>
      <div class="info-row">
        <span class="info-label">Start Date:</span>
        <span class="info-value">${data.startDate}</span>
      </div>
      <div class="info-row">
        <span class="info-label">End Date:</span>
        <span class="info-value">${data.endDate}</span>
      </div>
      <div class="info-row">
        <span class="info-label">Total Days:</span>
        <span class="info-value">${data.daysCount}</span>
      </div>
    </div>
    
    <div class="alert-box alert-info">
      <strong>Reason:</strong><br>${data.reason}
    </div>
    
    <div style="text-align: center; margin: 32px 0;">
      <a href="${data.requestUrl}" class="button">Review Request</a>
    </div>
    
    <div class="divider"></div>
    <p>Please review and take action at your earliest convenience.</p>
    <p>Best regards,<br>HRFlow Pro</p>
  `;
  
  return wrapEmail(content);
}

export function leaveApprovalEmail(data: {
  employeeName: string;
  leaveType: string;
  startDate: string;
  endDate: string;
  daysCount: number;
  status: 'APPROVED' | 'REJECTED';
  approverName: string;
  comments?: string;
  dashboardUrl: string;
}): string {
  const isApproved = data.status === 'APPROVED';
  const badgeClass = isApproved ? 'badge-approved' : 'badge-rejected';
  const statusText = isApproved ? 'Approved' : 'Rejected';
  const buttonClass = isApproved ? 'button-success' : 'button-danger';
  
  const content = `
    <h2>Leave Request ${statusText}</h2>
    <p>Hello ${data.employeeName},</p>
    <p>Your leave request has been <strong>${statusText.toLowerCase()}</strong> by ${data.approverName}.</p>
    
    <div style="text-align: center; margin: 24px 0;">
      <span class="badge ${badgeClass}">${statusText}</span>
    </div>
    
    <div class="info-grid">
      <div class="info-row">
        <span class="info-label">Leave Type:</span>
        <span class="info-value">${data.leaveType}</span>
      </div>
      <div class="info-row">
        <span class="info-label">Start Date:</span>
        <span class="info-value">${data.startDate}</span>
      </div>
      <div class="info-row">
        <span class="info-label">End Date:</span>
        <span class="info-value">${data.endDate}</span>
      </div>
      <div class="info-row">
        <span class="info-label">Total Days:</span>
        <span class="info-value">${data.daysCount}</span>
      </div>
    </div>
    
    ${data.comments ? `
    <div class="alert-box ${isApproved ? 'alert-success' : 'alert-error'}">
      <strong>Comments:</strong><br>${data.comments}
    </div>
    ` : ''}
    
    <div style="text-align: center; margin: 32px 0;">
      <a href="${data.dashboardUrl}" class="button ${buttonClass}">View Dashboard</a>
    </div>
    
    <div class="divider"></div>
    <p>If you have any questions, please contact HR.</p>
    <p>Best regards,<br>HRFlow Pro</p>
  `;
  
  return wrapEmail(content);
}

export function payrollRunEmail(data: {
  runName: string;
  period: string;
  status: 'DRAFT' | 'PROCESSING' | 'COMPLETED' | 'FAILED';
  employeeCount: number;
  totalAmount: number;
  currency: string;
  processedBy: string;
  dashboardUrl: string;
  errorMessage?: string;
}): string {
  const statusBadges: Record<string, string> = {
    DRAFT: 'badge-processing',
    PROCESSING: 'badge-processing',
    COMPLETED: 'badge-completed',
    FAILED: 'badge-rejected',
  };
  
  const badgeClass = statusBadges[data.status] || 'badge-processing';
  
  const content = `
    <h2>Payroll Run ${data.status}</h2>
    <p>Payroll run <strong>${data.runName}</strong> has been updated.</p>
    
    <div style="text-align: center; margin: 24px 0;">
      <span class="badge ${badgeClass}">${data.status}</span>
    </div>
    
    <div class="info-grid">
      <div class="info-row">
        <span class="info-label">Period:</span>
        <span class="info-value">${data.period}</span>
      </div>
      <div class="info-row">
        <span class="info-label">Employees:</span>
        <span class="info-value">${data.employeeCount}</span>
      </div>
      <div class="info-row">
        <span class="info-label">Total Amount:</span>
        <span class="info-value">${data.currency} ${data.totalAmount.toLocaleString()}</span>
      </div>
      <div class="info-row">
        <span class="info-label">Processed By:</span>
        <span class="info-value">${data.processedBy}</span>
      </div>
    </div>
    
    ${data.errorMessage ? `
    <div class="alert-box alert-error">
      <strong>Error:</strong><br>${data.errorMessage}
    </div>
    ` : data.status === 'COMPLETED' ? `
    <div class="alert-box alert-success">
      Payroll has been processed successfully. Payslips have been generated and distributed to employees.
    </div>
    ` : data.status === 'PROCESSING' ? `
    <div class="alert-box alert-info">
      Payroll is currently being processed. You will receive a notification once completed.
    </div>
    ` : ''}
    
    <div style="text-align: center; margin: 32px 0;">
      <a href="${data.dashboardUrl}" class="button">View Payroll Details</a>
    </div>
    
    <div class="divider"></div>
    <p>Best regards,<br>HRFlow Pro Payroll System</p>
  `;
  
  return wrapEmail(content);
}

export function payslipEmail(data: {
  employeeName: string;
  period: string;
  netPay: number;
  currency: string;
  payslipUrl: string;
  password?: string;
}): string {
  const content = `
    <h2>Your Payslip for ${data.period}</h2>
    <p>Hello ${data.employeeName},</p>
    <p>Your payslip for <strong>${data.period}</strong> is now available.</p>
    
    <div style="text-align: center; margin: 24px 0; padding: 24px; background: linear-gradient(135deg, ${colors.navy} 0%, ${colors.blue} 100%); border-radius: 12px;">
      <p style="color: rgba(255,255,255,0.8); font-size: 14px; margin: 0;">Net Pay</p>
      <p style="color: ${colors.white}; font-size: 32px; font-weight: 700; margin: 8px 0 0 0;">${data.currency} ${data.netPay.toLocaleString()}</p>
    </div>
    
    ${data.password ? `
    <div class="alert-box alert-warning">
      <strong>Password Protected:</strong> Your payslip is password protected.<br>
      Password: <code style="background: ${colors.lightGray}; padding: 4px 8px; border-radius: 4px; font-family: monospace;">${data.password}</code>
    </div>
    ` : ''}
    
    <div style="text-align: center; margin: 32px 0;">
      <a href="${data.payslipUrl}" class="button">Download Payslip</a>
    </div>
    
    <div class="divider"></div>
    <p>For security, please do not share your payslip or password with anyone.</p>
    <p>If you have any questions about your payslip, please contact HR or Payroll.</p>
    <p>Best regards,<br>HRFlow Pro</p>
  `;
  
  return wrapEmail(content);
}

export function form16Email(data: {
  employeeName: string;
  financialYear: string;
  form16Url: string;
  password?: string;
}): string {
  const content = `
    <h2>Form 16 - ${data.financialYear}</h2>
    <p>Hello ${data.employeeName},</p>
    <p>Your Form 16 (TDS Certificate) for the financial year <strong>${data.financialYear}</strong> is now available for download.</p>
    
    <div class="alert-box alert-info">
      <strong>What is Form 16?</strong><br>
      Form 16 is a certificate issued by employers certifying the TDS (Tax Deducted at Source) on salary. It is required for filing your income tax return.
    </div>
    
    ${data.password ? `
    <div class="alert-box alert-warning">
      <strong>Password Protected:</strong> Your Form 16 is password protected.<br>
      Password: <code style="background: ${colors.lightGray}; padding: 4px 8px; border-radius: 4px; font-family: monospace;">${data.password}</code>
    </div>
    ` : ''}
    
    <div style="text-align: center; margin: 32px 0;">
      <a href="${data.form16Url}" class="button">Download Form 16</a>
    </div>
    
    <div class="attachment-notice">
      📎 Form 16 PDF is attached to this email for your convenience.
    </div>
    
    <div class="divider"></div>
    <p>Please keep this document safe for your tax filing records.</p>
    <p>If you have any questions, please contact the Payroll or Finance team.</p>
    <p>Best regards,<br>HRFlow Pro</p>
  `;
  
  return wrapEmail(content);
}

export function appointmentEmail(data: {
  employeeName: string;
  position: string;
  department: string;
  startDate: string;
  employmentType: string;
  reportingManager: string;
  salary: number;
  currency: string;
  offerLetterUrl: string;
  acceptUrl: string;
  expireDate: string;
}): string {
  const content = `
    <h2>Appointment Letter - ${data.position}</h2>
    <p>Dear ${data.employeeName},</p>
    <p>Congratulations! We are pleased to offer you the position of <strong>${data.position}</strong> in the <strong>${data.department}</strong> department.</p>
    
    <div class="info-grid">
      <div class="info-row">
        <span class="info-label">Position:</span>
        <span class="info-value">${data.position}</span>
      </div>
      <div class="info-row">
        <span class="info-label">Department:</span>
        <span class="info-value">${data.department}</span>
      </div>
      <div class="info-row">
        <span class="info-label">Start Date:</span>
        <span class="info-value">${data.startDate}</span>
      </div>
      <div class="info-row">
        <span class="info-label">Employment Type:</span>
        <span class="info-value">${data.employmentType}</span>
      </div>
      <div class="info-row">
        <span class="info-label">Reporting To:</span>
        <span class="info-value">${data.reportingManager}</span>
      </div>
      <div class="info-row">
        <span class="info-label">Annual CTC:</span>
        <span class="info-value">${data.currency} ${data.salary.toLocaleString()}</span>
      </div>
    </div>
    
    <div class="alert-box alert-info">
      <strong>Important:</strong> This offer is valid until <strong>${data.expireDate}</strong>. Please review and accept before this date.
    </div>
    
    <div style="text-align: center; margin: 32px 0;">
      <a href="${data.offerLetterUrl}" class="button">View Offer Letter</a>
      <a href="${data.acceptUrl}" class="button button-success" style="margin-left: 12px;">Accept Offer</a>
    </div>
    
    <div class="divider"></div>
    <p>We look forward to welcoming you to the team!</p>
    <p>Best regards,<br>HRFlow Pro - Talent Acquisition</p>
  `;
  
  return wrapEmail(content);
}

export function passwordResetEmail(data: {
  firstName: string;
  resetUrl: string;
  expireMinutes: number;
  ipAddress?: string;
}): string {
  const content = `
    <h2>Password Reset Request</h2>
    <p>Hello ${data.firstName},</p>
    <p>We received a request to reset your password. Click the button below to create a new password.</p>
    
    <div style="text-align: center; margin: 32px 0;">
      <a href="${data.resetUrl}" class="button">Reset Password</a>
    </div>
    
    <div class="alert-box alert-warning">
      <strong>Security Notice:</strong>
      <ul style="margin: 8px 0 0 0; padding-left: 20px; font-size: 14px; color: ${colors.gray};">
        <li>This link expires in ${data.expireMinutes} minutes</li>
        <li>If you didn't request this, please ignore this email</li>
        ${data.ipAddress ? `<li>Request from IP: ${data.ipAddress}</li>` : ''}
      </ul>
    </div>
    
    <div class="divider"></div>
    <p>For security, this link can only be used once. If you need to reset your password again, please request a new link.</p>
    <p>Best regards,<br>HRFlow Pro Security Team</p>
  `;
  
  return wrapEmail(content);
}

export function emailVerificationEmail(data: {
  firstName: string;
  verificationUrl: string;
  expireHours: number;
}): string {
  const content = `
    <h2>Verify Your Email Address</h2>
    <p>Hello ${data.firstName},</p>
    <p>Welcome to HRFlow Pro! Please verify your email address to activate your account.</p>
    
    <div style="text-align: center; margin: 32px 0;">
      <a href="${data.verificationUrl}" class="button">Verify Email Address</a>
    </div>
    
    <div class="alert-box alert-info">
      <strong>Note:</strong> This verification link expires in ${data.expireHours} hours. If you didn't create an account, you can safely ignore this email.
    </div>
    
    <div class="divider"></div>
    <p>Once verified, you'll have full access to all HRFlow Pro features.</p>
    <p>Best regards,<br>The HRFlow Pro Team</p>
  `;
  
  return wrapEmail(content);
}

interface SendEmailOptions {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
  attachments?: Array<{
    filename: string;
    content: Buffer | string;
    contentType?: string;
  }>;
  replyTo?: string;
}

interface EmailResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

async function sendWithRetry(
  mailOptions: nodemailer.SendMailOptions,
  retries: number = 3,
  delay: number = 1000
): Promise<EmailResult> {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const info = await transporter.sendMail(mailOptions);
      logger.info(`Email sent successfully: ${info.messageId}`);
      return { success: true, messageId: info.messageId };
    } catch (error) {
      const err = error as Error;
      logger.warn(`Email send attempt ${attempt} failed: ${err.message}`);
      
      if (attempt === retries) {
        logger.error(`Email send failed after all retries: ${err.message}`);
        return { success: false, error: err.message };
      }
      
      await new Promise(resolve => setTimeout(resolve, delay * attempt));
    }
  }
  
  return { success: false, error: 'Max retries exceeded' };
}

export async function sendEmail(options: SendEmailOptions): Promise<EmailResult> {
  const mailOptions: nodemailer.SendMailOptions = {
    from: `"${config.smtp.fromName}" <${config.smtp.from || 'noreply@hrflowpro.com'}>`,
    to: Array.isArray(options.to) ? options.to.join(', ') : options.to,
    subject: options.subject,
    html: options.html,
    text: options.text,
    attachments: options.attachments,
    replyTo: options.replyTo,
  };
  
  return sendWithRetry(mailOptions);
}

export async function sendBulkEmail(
  recipients: Array<{ email: string; data: Record<string, unknown> }>,
  templateFn: (data: Record<string, unknown>) => string,
  subject: string,
  options: {
    batchSize?: number;
    delayBetweenBatches?: number;
    attachments?: SendEmailOptions['attachments'];
  } = {}
): Promise<{ sent: number; failed: number; errors: Array<{ email: string; error: string }> }> {
  const { batchSize = 10, delayBetweenBatches = 1000, attachments } = options;
  let sent = 0;
  let failed = 0;
  const errors: Array<{ email: string; error: string }> = [];
  
  for (let i = 0; i < recipients.length; i += batchSize) {
    const batch = recipients.slice(i, i + batchSize);
    
    await Promise.all(
      batch.map(async ({ email, data }) => {
        try {
          const html = templateFn(data);
          const result = await sendEmail({
            to: email,
            subject,
            html,
            attachments,
          });
          
          if (result.success) {
            sent++;
          } else {
            failed++;
            errors.push({ email, error: result.error || 'Unknown error' });
          }
        } catch (error) {
          failed++;
          errors.push({ email, error: (error as Error).message });
        }
      })
    );
    
    if (i + batchSize < recipients.length) {
      await new Promise(resolve => setTimeout(resolve, delayBetweenBatches));
    }
  }
  
  logger.info(`Bulk email completed. Sent: ${sent}, Failed: ${failed}, Total: ${recipients.length}`);
  return { sent, failed, errors };
}

export async function verifyConnection(): Promise<boolean> {
  try {
    await transporter.verify();
    logger.info('SMTP connection verified successfully');
    return true;
  } catch (error) {
    logger.error(`SMTP connection verification failed: ${(error as Error).message}`);
    return false;
  }
}

export { transporter, colors };