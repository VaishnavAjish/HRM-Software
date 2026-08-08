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

    /**
     * HTML plus a plain-text alternative.
     *
     * The text part is not decoration. An HTML-only message with no multipart
     * alternative is a long-standing spam signal, and Gmail weighs it heavily
     * for a transactional mail from a low-volume domain — which is exactly what
     * this is. Shipping both parts is the cheapest deliverability fix available.
     */
    public function content(): Content
    {
        return new Content(
            htmlString: view('emails.otp', [
                'otp' => $this->otp,
                'employeeName' => $this->employeeName,
            ])->render(),
            text: 'emails.otp_text',
            with: [
                'otp' => $this->otp,
                'employeeName' => $this->employeeName,
            ],
        );
    }
}
