<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="X-UA-Compatible" content="IE=edge">
    <title>Nidhi Impex OTP Verification</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f5f3fa; font-family: Arial, Helvetica, sans-serif; color: #222222;">
    <div style="display: none; max-height: 0; overflow: hidden; opacity: 0; visibility: hidden;">
        Your Nidhi Impex verification code is {{ $otp }}. This OTP expires in 5 minutes.
    </div>

    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color: #f5f3fa; margin: 0; padding: 24px 12px;">
        <tr>
            <td align="center">
                <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="680" style="width: 100%; max-width: 680px; background-color: #ffffff; border: 1px solid #e6e2ea; border-radius: 28px;">
                    <tr>
                        <td style="padding: 42px 40px 28px 40px; text-align: center;">
                            <img
                                src="{{ $message->embed(public_path('images/nidhi-impex-logo.png')) }}"
                                alt="Nidhi Impex"
                                width="250"
                                style="display: block; width: 280px; max-width: 100%; height: auto; margin: 0 auto;"
                            >
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
                                        {{ $otp }}
                                    </td>
                                </tr>
                            </table>
                        </td>
                    </tr>

                    <tr>
                        <td style="padding: 28px 40px 18px 40px; text-align: center;">
                            <p style="margin: 0; font-size: 16px; line-height: 28px; color: #777777;">
                                If you did not request this code, you can safely ignore this email.
                                This OTP will remain active for 5 minutes.
                            </p>
                        </td>
                    </tr>

                    <tr>
                        <td style="padding: 22px 40px 0 40px;">
                            <div style="height: 1px; background-color: #e5e2e8; width: 100%;"></div>
                        </td>
                    </tr>

                    <tr>
                        <td style="padding: 24px 40px 42px 40px; text-align: center;">
                            <p style="margin: 0 0 10px 0; font-size: 16px; line-height: 28px; color: #757575;">
                                Nidhi Impex, a trusted partner for quality and excellence.
                            </p>
                            <p style="margin: 0; font-size: 14px; line-height: 24px; color: #9b9b9b;">
                                &copy; {{ date('Y') }} Nidhi Impex. All rights reserved.
                            </p>
                        </td>
                    </tr>
                </table>
            </td>
        </tr>
    </table>
</body>
</html>
