<?php

namespace App\Mail;

use Illuminate\Bus\Queueable;
use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;
use Illuminate\Queue\SerializesModels;

/** Sent whenever an interview is scheduled or rescheduled — see InterviewController::store/reschedule. */
class InterviewScheduledMail extends Mailable
{
    use Queueable, SerializesModels;

    public function __construct(
        public string $candidateName,
        public string $roleTitle,
        public string $roundName,
        public string $scheduledAtFormatted,
        public int $durationMinutes,
        public string $mode,
        public ?string $meetingLink,
        public bool $isReschedule,
    ) {
    }

    public function envelope(): Envelope
    {
        return new Envelope(
            subject: ($this->isReschedule ? 'Interview rescheduled: ' : 'Interview scheduled: ') . $this->roleTitle,
        );
    }

    public function content(): Content
    {
        return new Content(
            htmlString: view('emails.interview-scheduled', [
                'candidateName' => $this->candidateName,
                'roleTitle' => $this->roleTitle,
                'roundName' => $this->roundName,
                'scheduledAtFormatted' => $this->scheduledAtFormatted,
                'durationMinutes' => $this->durationMinutes,
                'mode' => $this->mode,
                'meetingLink' => $this->meetingLink,
                'isReschedule' => $this->isReschedule,
            ])->render(),
        );
    }
}
