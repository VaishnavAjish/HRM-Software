<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
    <title>Assessment Invite – NISS HRMS</title>
</head>
<body style="margin:0;padding:0;background-color:#f1f5f9;font-family:'Segoe UI',Arial,sans-serif;">

    <table width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:40px 0;">
        <tr>
            <td align="center">
                <table width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">

                    {{-- Header --}}
                    <tr>
                        <td style="background:linear-gradient(135deg,#f97316 0%,#ea580c 100%);padding:32px 40px;text-align:center;">
                            <h1 style="margin:0;color:#ffffff;font-size:22px;font-weight:700;letter-spacing:0.5px;">&#128203; NISS HRMS</h1>
                            <p style="margin:6px 0 0;color:#fed7aa;font-size:13px;">Hiring &middot; Assessment</p>
                        </td>
                    </tr>

                    {{-- Body --}}
                    <tr>
                        <td style="padding:40px 40px 32px;">
                            <p style="margin:0 0 8px;color:#6b7280;font-size:14px;font-weight:500;text-transform:uppercase;letter-spacing:1px;">Hello,</p>
                            <h2 style="margin:0 0 16px;color:#111827;font-size:22px;font-weight:700;">{{ $candidateName }}</h2>
                            <p style="margin:0 0 24px;color:#4b5563;font-size:15px;line-height:1.7;">
                                Thanks for applying for the <strong>{{ $roleTitle }}</strong> role. As the next step, we'd like you to complete a short online assessment.
                                @if($startsAt)
                                    The link below becomes active on <strong>{{ $startsAt }}</strong> — it won't let you start before then, so no need to try early.
                                @endif
                            </p>

                            {{-- Details card --}}
                            <table width="100%" cellpadding="0" cellspacing="0" style="background:#fff7ed;border:1px solid #fed7aa;border-radius:12px;margin-bottom:28px;">
                                <tr>
                                    <td style="padding:20px 24px;">
                                        <table width="100%" cellpadding="0" cellspacing="0">
                                            <tr>
                                                <td style="padding:6px 0;color:#9a3412;font-size:13px;font-weight:600;">Assessment</td>
                                                <td style="padding:6px 0;color:#431407;font-size:13px;text-align:right;">{{ $quizTitle }}</td>
                                            </tr>
                                            <tr>
                                                <td style="padding:6px 0;color:#9a3412;font-size:13px;font-weight:600;">Duration</td>
                                                <td style="padding:6px 0;color:#431407;font-size:13px;text-align:right;">{{ $durationMinutes }} minutes</td>
                                            </tr>
                                            <tr>
                                                <td style="padding:6px 0;color:#9a3412;font-size:13px;font-weight:600;">Passing score</td>
                                                <td style="padding:6px 0;color:#431407;font-size:13px;text-align:right;">{{ $passingScore }}%</td>
                                            </tr>
                                            @if($startsAt)
                                            <tr>
                                                <td style="padding:6px 0;color:#9a3412;font-size:13px;font-weight:600;">Opens</td>
                                                <td style="padding:6px 0;color:#431407;font-size:13px;text-align:right;font-weight:700;">{{ $startsAt }}</td>
                                            </tr>
                                            @endif
                                            @if($expiresAt)
                                            <tr>
                                                <td style="padding:6px 0;color:#9a3412;font-size:13px;font-weight:600;">Link valid until</td>
                                                <td style="padding:6px 0;color:#431407;font-size:13px;text-align:right;">{{ $expiresAt }}</td>
                                            </tr>
                                            @endif
                                        </table>
                                    </td>
                                </tr>
                            </table>

                            @if($quizUrl)
                            {{-- CTA --}}
                            <table width="100%" cellpadding="0" cellspacing="0">
                                <tr>
                                    <td align="center" style="padding:0 0 28px;">
                                        <a href="{{ $quizUrl }}" style="display:inline-block;background:linear-gradient(135deg,#f97316 0%,#ea580c 100%);color:#ffffff;text-decoration:none;font-size:15px;font-weight:700;padding:14px 40px;border-radius:10px;">
                                            Start Assessment
                                        </a>
                                    </td>
                                </tr>
                            </table>
                            <p style="margin:0 0 24px;color:#9ca3af;font-size:12px;line-height:1.6;word-break:break-all;">
                                If the button doesn't work, copy this link into your browser: <a href="{{ $quizUrl }}" style="color:#ea580c;">{{ $quizUrl }}</a>
                            </p>
                            @endif

                            <p style="margin:0;color:#9ca3af;font-size:13px;line-height:1.6;">
                                Please complete it in one sitting once you start — the timer can't be paused. Good luck!
                            </p>
                        </td>
                    </tr>

                    {{-- Footer --}}
                    <tr>
                        <td style="background:#f9fafb;border-top:1px solid #e5e7eb;padding:20px 40px;text-align:center;">
                            <p style="margin:0 0 4px;color:#9ca3af;font-size:12px;">This email was sent by <strong style="color:#ea580c;">NISS HRMS</strong> &middot; <a href="https://niss.pro" style="color:#ea580c;text-decoration:none;">niss.pro</a></p>
                            <p style="margin:0;color:#d1d5db;font-size:11px;">&copy; {{ date('Y') }} NISS. All rights reserved.</p>
                        </td>
                    </tr>

                </table>
            </td>
        </tr>
    </table>

</body>
</html>
