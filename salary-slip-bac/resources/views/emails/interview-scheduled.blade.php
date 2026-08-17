<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
    <title>Interview {{ $isReschedule ? 'Rescheduled' : 'Scheduled' }} – NISS HRMS</title>
</head>
<body style="margin:0;padding:0;background-color:#f1f5f9;font-family:'Segoe UI',Arial,sans-serif;">

    <table width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:40px 0;">
        <tr>
            <td align="center">
                <table width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">

                    {{-- Header --}}
                    <tr>
                        <td style="background:linear-gradient(135deg,#0891b2 0%,#0e7490 100%);padding:32px 40px;text-align:center;">
                            <h1 style="margin:0;color:#ffffff;font-size:22px;font-weight:700;letter-spacing:0.5px;">&#128197; NISS HRMS</h1>
                            <p style="margin:6px 0 0;color:#a5f3fc;font-size:13px;">Hiring &middot; Interview {{ $isReschedule ? 'Update' : 'Invitation' }}</p>
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
                            <p style="margin:0 0 24px;color:#4b5563;font-size:15px;line-height:1.7;">
                                @if($isReschedule)
                                    Your interview for <strong>{{ $roleTitle }}</strong> has been rescheduled. Here are the updated details:
                                @else
                                    Congratulations on moving forward for the <strong>{{ $roleTitle }}</strong> role — your interview has been scheduled. Here are the details:
                                @endif
                            </p>
@endif

                            {{-- Details card --}}
                            <table width="100%" cellpadding="0" cellspacing="0" style="background:#ecfeff;border:1px solid #a5f3fc;border-radius:12px;margin-bottom:28px;">
                                <tr>
                                    <td style="padding:20px 24px;">
                                        <table width="100%" cellpadding="0" cellspacing="0">
                                            <tr>
                                                <td style="padding:6px 0;color:#155e75;font-size:13px;font-weight:600;">Round</td>
                                                <td style="padding:6px 0;color:#083344;font-size:13px;text-align:right;">{{ $roundName }}</td>
                                            </tr>
                                            <tr>
                                                <td style="padding:6px 0;color:#155e75;font-size:13px;font-weight:600;">Date &amp; time</td>
                                                <td style="padding:6px 0;color:#083344;font-size:13px;text-align:right;">{{ $scheduledAtFormatted }}</td>
                                            </tr>
                                            <tr>
                                                <td style="padding:6px 0;color:#155e75;font-size:13px;font-weight:600;">Duration</td>
                                                <td style="padding:6px 0;color:#083344;font-size:13px;text-align:right;">{{ $durationMinutes }} minutes</td>
                                            </tr>
                                            <tr>
                                                <td style="padding:6px 0;color:#155e75;font-size:13px;font-weight:600;">Mode</td>
                                                <td style="padding:6px 0;color:#083344;font-size:13px;text-align:right;text-transform:capitalize;">{{ $mode }}</td>
                                            </tr>
                                        </table>
                                    </td>
                                </tr>
                            </table>

                            @if($meetingLink)
                            <table width="100%" cellpadding="0" cellspacing="0">
                                <tr>
                                    <td align="center" style="padding:0 0 28px;">
                                        <a href="{{ $meetingLink }}" style="display:inline-block;background:linear-gradient(135deg,#0891b2 0%,#0e7490 100%);color:#ffffff;text-decoration:none;font-size:15px;font-weight:700;padding:14px 40px;border-radius:10px;">
                                            Join Interview
                                        </a>
                                    </td>
                                </tr>
                            </table>
                            <p style="margin:0 0 24px;color:#9ca3af;font-size:12px;line-height:1.6;word-break:break-all;">
                                Meeting link: <a href="{{ $meetingLink }}" style="color:#0e7490;">{{ $meetingLink }}</a>
                            </p>
                            @endif

                            <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:8px;">
                                <tr>
                                    <td style="background:#fef9c3;border-left:4px solid #eab308;border-radius:8px;padding:14px 16px;">
                                        <p style="margin:0;color:#854d0e;font-size:13px;">&#128161; Please join 5 minutes early and keep a valid photo ID handy.</p>
                                    </td>
                                </tr>
                            </table>

                            <p style="margin:16px 0 0;color:#9ca3af;font-size:13px;line-height:1.6;">
                                Need to reschedule? Reply to this email and our hiring team will help you find a new slot.
                            </p>
                        </td>
                    </tr>

                    {{-- Footer --}}
                    <tr>
                        <td style="background:#f9fafb;border-top:1px solid #e5e7eb;padding:20px 40px;text-align:center;">
                            <p style="margin:0 0 4px;color:#9ca3af;font-size:12px;">This email was sent by <strong style="color:#0e7490;">NISS HRMS</strong> &middot; <a href="https://niss.pro" style="color:#0e7490;text-decoration:none;">niss.pro</a></p>
                            <p style="margin:0;color:#d1d5db;font-size:11px;">&copy; {{ date('Y') }} NISS. All rights reserved.</p>
                        </td>
                    </tr>

                </table>
            </td>
        </tr>
    </table>

</body>
</html>
