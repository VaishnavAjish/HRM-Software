<?php

namespace App\Mail;

use Illuminate\Bus\Queueable;
use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;
use Illuminate\Queue\SerializesModels;

class PortalOtpMail extends Mailable
{
    use Queueable, SerializesModels;

    public function __construct(
        public string $otp,
        public string $employeeName,
    ) {
    }

    public function envelope(): Envelope
    {
        return new Envelope(
            subject: 'Your verification code',
        );
    }

    public function content(): Content
    {
        return new Content(
            htmlString: view('emails.otp', [
                'otp' => $this->otp,
                'employeeName' => $this->employeeName,
            ])->render(),
        );
    }
}
