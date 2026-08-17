<?php

namespace App\Mail;

use Illuminate\Bus\Queueable;
use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;
use Illuminate\Queue\SerializesModels;

class CandidateResetPasswordMail extends Mailable
{
    use Queueable, SerializesModels;

    public function __construct(
        public string $candidateName,
        public string $resetUrl,
    ) {
    }

    public function envelope(): Envelope
    {
        return new Envelope(
            subject: 'Reset your password — NISS Careers',
        );
    }

    public function content(): Content
    {
        return new Content(
            htmlString: view('emails.candidate-reset-password', [
                'candidateName' => $this->candidateName,
                'resetUrl' => $this->resetUrl,
            ])->render(),
        );
    }
}
