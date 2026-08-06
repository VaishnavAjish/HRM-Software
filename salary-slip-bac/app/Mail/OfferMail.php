<?php

namespace App\Mail;

use Illuminate\Bus\Queueable;
use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;
use Illuminate\Queue\SerializesModels;

/** Sent when HR releases an approved offer to the candidate — see OfferController::release. */
class OfferMail extends Mailable
{
    use Queueable, SerializesModels;

    public function __construct(
        public string $candidateName,
        public string $designation,
        public string $ctcFormatted,
        public ?string $joiningDateFormatted,
        public ?string $expiryDateFormatted,
    ) {
    }

    public function envelope(): Envelope
    {
        return new Envelope(
            subject: "Your offer letter for {$this->designation}",
        );
    }

    public function content(): Content
    {
        return new Content(
            htmlString: view('emails.offer-letter', [
                'candidateName' => $this->candidateName,
                'designation' => $this->designation,
                'ctcFormatted' => $this->ctcFormatted,
                'joiningDateFormatted' => $this->joiningDateFormatted,
                'expiryDateFormatted' => $this->expiryDateFormatted,
            ])->render(),
        );
    }
}
