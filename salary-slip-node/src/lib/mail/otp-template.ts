/**
 * The OTP email, ported from resources/views/emails/otp.blade.php.
 *
 * Reproduced markup-for-markup rather than redesigned: this is what recipients
 * already recognise, and an email that looks different from the last one is
 * exactly what a phishing filter — human or automated — reacts to.
 *
 * The logo is a CID attachment, matching Blade's $message->embed(). A remote
 * <img src> would be blocked by most clients until the reader opts in, so the
 * mail would arrive visibly broken.
 */

export const LOGO_CID = 'nidhi-impex-logo';

export const OTP_SUBJECT = 'Your verification code';

export function renderOtpEmail(otp: string, employeeName: string, year = new Date().getFullYear()): string {
  const safeOtp = escapeHtml(otp);
  const safeName = escapeHtml(employeeName);

  return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="X-UA-Compatible" content="IE=edge">
    <title>Nidhi Impex OTP Verification</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f5f3fa; font-family: Arial, Helvetica, sans-serif; color: #222222;">
    <div style="display: none; max-height: 0; overflow: hidden; opacity: 0; visibility: hidden;">
        Your Nidhi Impex verification code is ${safeOtp}. This OTP expires in 5 minutes.
    </div>

    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color: #f5f3fa; margin: 0; padding: 24px 12px;">
        <tr>
            <td align="center">
                <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="680" style="width: 100%; max-width: 680px; background-color: #ffffff; border: 1px solid #e6e2ea; border-radius: 28px;">
                    <tr>
                        <td style="padding: 42px 40px 28px 40px; text-align: center;">
                            <img src="cid:${LOGO_CID}" alt="Nidhi Impex" width="250" style="display: block; width: 280px; max-width: 100%; height: auto; margin: 0 auto;">
                        </td>
                    </tr>

                    <tr>
                        <td style="padding: 0 40px 8px 40px; text-align: center;">
                            <h1 style="margin: 0; font-size: 34px; line-height: 44px; color: #1f1f1f; font-weight: 700;">
                                Verify your email address
                            </h1>
                        </td>
                    </tr>

                    <tr>
                        <td style="padding: 0 40px 28px 40px; text-align: center;">
                            <p style="margin: 0; font-size: 18px; line-height: 30px; color: #4d4d4d;">
                                We received a verification request for your Nidhi Impex account.
                                Please enter the code below in the window where you started the process.
                            </p>
                        </td>
                    </tr>

                    <tr>
                        <td style="padding: 0 40px;">
                            <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color: #f3f4f4; border-radius: 20px;">
                                <tr>
                                    <td align="center" style="padding: 34px 20px; font-size: 46px; line-height: 1; font-weight: 700; letter-spacing: 10px; color: #1f1f1f; font-family: 'Courier New', Courier, monospace;">
                                        ${safeOtp}
                                    </td>
                                </tr>
                            </table>
                        </td>
                    </tr>

                    <tr>
                        <td style="padding: 28px 40px 18px 40px; text-align: center;">
                            <p style="margin: 0; font-size: 16px; line-height: 28px; color: #777777;"></p>
                        </td>
                    </tr>

                    <tr>
                        <td style="background:#f9fafb;border-top:1px solid #e5e7eb;padding:20px 40px;text-align:center;">
                            <p style="margin:0 0 4px;color:#9ca3af;font-size:12px;">This email was sent by <strong style="color:#4f46e5;">NISS HRMS</strong> &middot; <a href="https://niss.pro" style="color:#4f46e5;text-decoration:none;">niss.pro</a></p>
                            <p style="margin:0;color:#d1d5db;font-size:11px;">&copy; ${year} NISS. All rights reserved.</p>
                        </td>
                    </tr>

                </table>
            </td>
        </tr>
    </table>
${safeName ? '' : ''}
</body>
</html>`;
}

/**
 * Blade escapes {{ }} by default. The OTP is generated server-side and the
 * name comes from the database, but escaping here keeps that guarantee local
 * rather than relying on where the values happened to come from.
 */
function escapeHtml(value: string): string {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
