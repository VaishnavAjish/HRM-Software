<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
    <title>Message from NISS HRMS</title>
</head>
<body style="margin:0;padding:0;background-color:#f1f5f9;font-family:'Segoe UI',Arial,sans-serif;">

    <table width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:40px 0;">
        <tr>
            <td align="center">
                <table width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">

                    {{-- Header --}}
                    <tr>
                        <td style="background:linear-gradient(135deg,#0891b2 0%,#0e7490 100%);padding:32px 40px;text-align:center;">
                            <h1 style="margin:0;color:#ffffff;font-size:22px;font-weight:700;letter-spacing:0.5px;">NISS HRMS</h1>
                            <p style="margin:6px 0 0;color:#a5f3fc;font-size:13px;">Recruitment Team</p>
                        </td>
                    </tr>

                    {{-- Body --}}
                    <tr>
                        <td style="padding:40px 40px 32px;">
                            @if(isset($customBody))
                            <div style="white-space: pre-wrap; font-size: 15px; color: #4b5563; line-height: 1.7; margin-bottom: 24px;">
                                {!! nl2br(e($customBody)) !!}
                            </div>
@else
                            <p style="margin:0 0 8px;color:#6b7280;font-size:14px;font-weight:500;text-transform:uppercase;letter-spacing:1px;">Hello,</p>
                            <h2 style="margin:0 0 16px;color:#111827;font-size:22px;font-weight:700;">{{ $candidateName }}</h2>
                            <div style="margin:0 0 24px;color:#4b5563;font-size:15px;line-height:1.7;white-space:pre-line;">{{ $body }}</div>
                            <p style="margin:16px 0 0;color:#9ca3af;font-size:13px;line-height:1.6;">
                                If you have any questions, reply to this email and our hiring team will help you.
                            </p>
@endif
                        </td>
                    </tr>

                    {{-- Footer --}}
                    <tr>
                        <td style="background:#f9fafb;border-top:1px solid #e5e7eb;padding:20px 40px;text-align:center;">
                            <p style="margin:0 0 4px;color:#9ca3af;font-size:12px;">This email was sent by <strong style="color:#0e7490;">NISS HRMS</strong> &middot; <a href="https://niss.pro" style="color:#0e7490;text-decoration:none;">niss.pro</a></p>
                        </td>
                    </tr>

                </table>
            </td>
        </tr>
    </table>

</body>
</html>