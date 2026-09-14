<?php

namespace App\Mail\Mediclaim;

use Illuminate\Bus\Queueable;
use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;
use Illuminate\Queue\SerializesModels;

/**
 * Sent to the employee when their Mediclaim claim is (re)submitted — see
 * MediclaimNotifier::claimSubmitted(). Generic phrasing only: never the
 * diagnosis, hospital name, or document names on a claim (an explicit
 * Mediclaim B7 requirement).
 */
class MediclaimClaimSubmittedMail extends Mailable
{
    use Queueable, SerializesModels;

    public function __construct(
        public string $employeeName,
        public string $claimNumber,
    ) {
    }

    public function envelope(): Envelope
    {
        return new Envelope(
            subject: "Mediclaim claim {$this->claimNumber} submitted",
        );
    }

    public function content(): Content
    {
        return new Content(
            view: 'emails.mediclaim.claim-submitted',
            with: [
                'employeeName' => $this->employeeName,
                'claimNumber' => $this->claimNumber,
            ],
        );
    }
}
