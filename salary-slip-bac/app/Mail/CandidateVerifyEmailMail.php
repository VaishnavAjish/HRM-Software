<?php

namespace App\Mail;

use Illuminate\Bus\Queueable;
use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;
use Illuminate\Queue\SerializesModels;

class CandidateVerifyEmailMail extends Mailable
{
    use Queueable, SerializesModels;

    public function __construct(
        public string $candidateName,
        public string $verifyUrl,
    ) {
    }

    public function envelope(): Envelope
    {
        return new Envelope(
            subject: 'Verify your email — NISS Careers',
        );
    }

    public function content(): Content
    {
        return new Content(
            htmlString: view('emails.candidate-verify-email', [
                'candidateName' => $this->candidateName,
                'verifyUrl' => $this->verifyUrl,
            ])->render(),
        );
    }
}
