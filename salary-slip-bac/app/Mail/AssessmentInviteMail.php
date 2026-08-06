<?php

namespace App\Mail;

use Illuminate\Bus\Queueable;
use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;
use Illuminate\Queue\SerializesModels;

/**
 * Sent when HR assigns a quiz to a candidate from the Assessment tab. Carries
 * the same candidate-facing link the UI's "copy link" action already builds
 * (FRONTEND_URL + /quiz/{access_token}) so the candidate doesn't depend on
 * HR remembering to paste it somewhere.
 */
class AssessmentInviteMail extends Mailable
{
    use Queueable, SerializesModels;

    public function __construct(
        public string $candidateName,
        public string $roleTitle,
        public string $quizTitle,
        public int $durationMinutes,
        public int $passingScore,
        public ?string $quizUrl,
        public ?string $startsAt,
        public ?string $expiresAt,
    ) {
    }

    public function envelope(): Envelope
    {
        return new Envelope(
            subject: "Assessment invite: {$this->roleTitle}",
        );
    }

    public function content(): Content
    {
        return new Content(
            htmlString: view('emails.assessment-invite', [
                'candidateName' => $this->candidateName,
                'roleTitle' => $this->roleTitle,
                'quizTitle' => $this->quizTitle,
                'durationMinutes' => $this->durationMinutes,
                'passingScore' => $this->passingScore,
                'quizUrl' => $this->quizUrl,
                'startsAt' => $this->startsAt,
                'expiresAt' => $this->expiresAt,
            ])->render(),
        );
    }
}
