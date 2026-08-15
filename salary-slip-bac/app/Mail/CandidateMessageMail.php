<?php

namespace App\Mail;

use Illuminate\Bus\Queueable;
use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;
use Illuminate\Queue\SerializesModels;

/**
 * Best-effort outbound candidate message — see CandidateCrmController
 * storeCommunication. Logs the attempt in candidate_communications regardless
 * of whether the transport succeeds.
 */
class CandidateMessageMail extends Mailable
{
    use Queueable, SerializesModels;

    public function __construct(
        public string $candidateName,
        public string $messageSubject,
        public string $body,
    ) {
    }

    public function envelope(): Envelope
    {
        return new Envelope(subject: $this->messageSubject);
    }

    public function content(): Content
    {
        return new Content(
            htmlString: view('emails.candidate-message', [
                'candidateName' => $this->candidateName,
                'body' => $this->body,
            ])->render(),
        );
    }
}