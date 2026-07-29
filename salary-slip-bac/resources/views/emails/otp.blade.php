<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
    <title>Verification Code – NISS HRMS</title>
</head>
<body style="margin:0;padding:0;background-color:#f1f5f9;font-family:'Segoe UI',Arial,sans-serif;">

    <table width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:40px 0;">
        <tr>
            <td align="center">
                <table width="520" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">

                    {{-- Header --}}
                    <tr>
                        <td style="background:linear-gradient(135deg,#4f46e5 0%,#7c3aed 100%);padding:32px 40px;text-align:center;">
                            <h1 style="margin:0;color:#ffffff;font-size:22px;font-weight:700;letter-spacing:0.5px;">&#127970; NISS HRMS</h1>
                            <p style="margin:6px 0 0;color:#c4b5fd;font-size:13px;">Human Resource Management System</p>
                        </td>
                    </tr>

                    {{-- Body --}}
                    <tr>
                        <td style="padding:40px 40px 32px;">

                            <p style="margin:0 0 8px;color:#6b7280;font-size:14px;font-weight:500;text-transform:uppercase;letter-spacing:1px;">Hello,</p>
                            <h2 style="margin:0 0 16px;color:#111827;font-size:22px;font-weight:700;">{{ $employeeName }}</h2>
                            <p style="margin:0 0 28px;color:#4b5563;font-size:15px;line-height:1.7;">
                                We received a request to verify your email address. Use the one-time verification code below to continue. This code is valid for <strong>15 minutes</strong>.
                            </p>

                            {{-- OTP Box --}}
                            <table width="100%" cellpadding="0" cellspacing="0">
                                <tr>
                                    <td align="center" style="padding:0 0 28px;">
                                        <table cellpadding="0" cellspacing="0" style="background:#f5f3ff;border:2px dashed #7c3aed;border-radius:12px;">
                                            <tr>
                                                <td style="padding:20px 48px;text-align:center;">
                                                    <p style="margin:0 0 6px;color:#7c3aed;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:2px;">Your Verification Code</p>
                                                    <p style="margin:0;color:#4f46e5;font-size:44px;font-weight:800;letter-spacing:14px;font-family:monospace;">{{ $otp }}</p>
                                                </td>
                                            </tr>
                                        </table>
                                    </td>
                                </tr>
                            </table>

                            {{-- Warning --}}
                            <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
                                <tr>
                                    <td style="background:#fef9c3;border-left:4px solid #eab308;border-radius:8px;padding:14px 16px;">
                                        <p style="margin:0;color:#854d0e;font-size:13px;">&#9888; <strong>Do not share</strong> this code with anyone. NISS HRMS staff will never ask for your OTP.</p>
                                    </td>
                                </tr>
                            </table>

                            <p style="margin:0;color:#9ca3af;font-size:13px;line-height:1.6;">
                                If you did not request this code, please ignore this email or contact your HR administrator immediately.
                            </p>
                        </td>
                    </tr>

                    {{-- Footer --}}
                    <tr>
                        <td style="background:#f9fafb;border-top:1px solid #e5e7eb;padding:20px 40px;text-align:center;">
                            <p style="margin:0 0 4px;color:#9ca3af;font-size:12px;">This email was sent by <strong style="color:#4f46e5;">NISS HRMS</strong> &middot; <a href="https://niss.pro" style="color:#4f46e5;text-decoration:none;">niss.pro</a></p>
                            <p style="margin:0;color:#d1d5db;font-size:11px;">&copy; {{ date('Y') }} NISS. All rights reserved.</p>
                        </td>
                    </tr>

                </table>
            </td>
        </tr>
    </table>

</body>
</html>
