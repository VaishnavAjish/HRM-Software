<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
    <title>Mediclaim Settlement Recorded &ndash; NISS HRMS</title>
</head>
<body style="margin:0;padding:0;background-color:#f1f5f9;font-family:'Segoe UI',Arial,sans-serif;">

    <table width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:40px 0;">
        <tr>
            <td align="center">
                <table width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">

                    <tr>
                        <td style="background:linear-gradient(135deg,#059669 0%,#047857 100%);padding:32px 40px;text-align:center;">
                            <h1 style="margin:0;color:#ffffff;font-size:22px;font-weight:700;letter-spacing:0.5px;">NISS HRMS</h1>
                            <p style="margin:6px 0 0;color:#a7f3d0;font-size:13px;">Mediclaim &middot; Settlement</p>
                        </td>
                    </tr>

                    <tr>
                        <td style="padding:40px 40px 32px;">
                            <p style="margin:0 0 8px;color:#6b7280;font-size:14px;font-weight:500;text-transform:uppercase;letter-spacing:1px;">Hello,</p>
                            <h2 style="margin:0 0 16px;color:#111827;font-size:22px;font-weight:700;">{{ $employeeName }}</h2>
                            <p style="margin:0 0 24px;color:#4b5563;font-size:15px;line-height:1.7;">
                                @if($fullySettled)
                                    Your Mediclaim claim has been fully settled.
                                @else
                                    A settlement payment has been recorded for your Mediclaim claim.
                                @endif
                            </p>

                            <table width="100%" cellpadding="0" cellspacing="0" style="background:#ecfdf5;border:1px solid #a7f3d0;border-radius:12px;margin-bottom:28px;">
                                <tr>
                                    <td style="padding:20px 24px;">
                                        <table width="100%" cellpadding="0" cellspacing="0">
                                            <tr>
                                                <td style="padding:6px 0;color:#065f46;font-size:13px;font-weight:600;">Claim number</td>
                                                <td style="padding:6px 0;color:#064e3b;font-size:13px;text-align:right;">{{ $claimNumber }}</td>
                                            </tr>
                                            <tr>
                                                <td style="padding:6px 0;color:#065f46;font-size:13px;font-weight:600;">Status</td>
                                                <td style="padding:6px 0;color:#064e3b;font-size:13px;text-align:right;">{{ $fullySettled ? 'Settled' : 'Settlement recorded' }}</td>
                                            </tr>
                                        </table>
                                    </td>
                                </tr>
                            </table>

                            <p style="margin:0;color:#9ca3af;font-size:13px;line-height:1.6;">
                                Sign in to the HRMS portal to see the full settlement details for your claim.
                            </p>
                        </td>
                    </tr>

                    <tr>
                        <td style="background:#f9fafb;border-top:1px solid #e5e7eb;padding:20px 40px;text-align:center;">
                            <p style="margin:0 0 4px;color:#9ca3af;font-size:12px;">This email was sent by <strong style="color:#0e7490;">NISS HRMS</strong></p>
                            <p style="margin:0;color:#d1d5db;font-size:11px;">&copy; {{ date('Y') }} NISS. All rights reserved.</p>
                        </td>
                    </tr>

                </table>
            </td>
        </tr>
    </table>

</body>
</html>
