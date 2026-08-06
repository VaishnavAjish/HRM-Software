<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
    <title>Your Offer Letter – NISS HRMS</title>
</head>
<body style="margin:0;padding:0;background-color:#f1f5f9;font-family:'Segoe UI',Arial,sans-serif;">

    <table width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:40px 0;">
        <tr>
            <td align="center">
                <table width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">

                    {{-- Header --}}
                    <tr>
                        <td style="background:linear-gradient(135deg,#16a34a 0%,#15803d 100%);padding:36px 40px;text-align:center;">
                            <h1 style="margin:0;color:#ffffff;font-size:24px;font-weight:700;letter-spacing:0.5px;">&#127881; Congratulations!</h1>
                            <p style="margin:6px 0 0;color:#bbf7d0;font-size:13px;">NISS HRMS &middot; Offer Letter</p>
                        </td>
                    </tr>

                    {{-- Body --}}
                    <tr>
                        <td style="padding:40px 40px 32px;">
                            <p style="margin:0 0 8px;color:#6b7280;font-size:14px;font-weight:500;text-transform:uppercase;letter-spacing:1px;">Dear,</p>
                            <h2 style="margin:0 0 16px;color:#111827;font-size:22px;font-weight:700;">{{ $candidateName }}</h2>
                            <p style="margin:0 0 24px;color:#4b5563;font-size:15px;line-height:1.7;">
                                We're delighted to offer you the position of <strong>{{ $designation }}</strong>. Welcome to the team — here's a summary of your offer:
                            </p>

                            {{-- Details card --}}
                            <table width="100%" cellpadding="0" cellspacing="0" style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:12px;margin-bottom:28px;">
                                <tr>
                                    <td style="padding:20px 24px;">
                                        <table width="100%" cellpadding="0" cellspacing="0">
                                            <tr>
                                                <td style="padding:6px 0;color:#166534;font-size:13px;font-weight:600;">Position</td>
                                                <td style="padding:6px 0;color:#052e16;font-size:13px;text-align:right;">{{ $designation }}</td>
                                            </tr>
                                            <tr>
                                                <td style="padding:6px 0;color:#166534;font-size:13px;font-weight:600;">Annual CTC</td>
                                                <td style="padding:6px 0;color:#052e16;font-size:13px;text-align:right;font-weight:700;">{{ $ctcFormatted }}</td>
                                            </tr>
                                            @if($joiningDateFormatted)
                                            <tr>
                                                <td style="padding:6px 0;color:#166534;font-size:13px;font-weight:600;">Joining date</td>
                                                <td style="padding:6px 0;color:#052e16;font-size:13px;text-align:right;">{{ $joiningDateFormatted }}</td>
                                            </tr>
                                            @endif
                                            @if($expiryDateFormatted)
                                            <tr>
                                                <td style="padding:6px 0;color:#166534;font-size:13px;font-weight:600;">Valid until</td>
                                                <td style="padding:6px 0;color:#052e16;font-size:13px;text-align:right;">{{ $expiryDateFormatted }}</td>
                                            </tr>
                                            @endif
                                        </table>
                                    </td>
                                </tr>
                            </table>

                            <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
                                <tr>
                                    <td style="background:#eff6ff;border-left:4px solid #3b82f6;border-radius:8px;padding:14px 16px;">
                                        <p style="margin:0;color:#1e3a8a;font-size:13px;line-height:1.6;">&#128172; Please reply to this email to accept or discuss the offer — our HR team will follow up with the full offer letter and onboarding steps.</p>
                                    </td>
                                </tr>
                            </table>

                            <p style="margin:0;color:#9ca3af;font-size:13px;line-height:1.6;">
                                We're excited about the possibility of you joining us. If you have any questions in the meantime, just reply here.
                            </p>
                        </td>
                    </tr>

                    {{-- Footer --}}
                    <tr>
                        <td style="background:#f9fafb;border-top:1px solid #e5e7eb;padding:20px 40px;text-align:center;">
                            <p style="margin:0 0 4px;color:#9ca3af;font-size:12px;">This email was sent by <strong style="color:#15803d;">NISS HRMS</strong> &middot; <a href="https://niss.pro" style="color:#15803d;text-decoration:none;">niss.pro</a></p>
                            <p style="margin:0;color:#d1d5db;font-size:11px;">&copy; {{ date('Y') }} NISS. All rights reserved.</p>
                        </td>
                    </tr>

                </table>
            </td>
        </tr>
    </table>

</body>
</html>
