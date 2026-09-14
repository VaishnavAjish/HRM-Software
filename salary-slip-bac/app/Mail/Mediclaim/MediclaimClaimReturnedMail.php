<?php

namespace App\Mail\Mediclaim;

use Illuminate\Bus\Queueable;
use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;
use Illuminate\Queue\SerializesModels;

/**
 * Sent to the employee when a review stage returns their Mediclaim claim for
 * correction — see MediclaimNotifier::returnedForCorrection(). Generic
 * phrasing only: never the diagnosis, hospital name, or document names on a
 * claim (an explicit Mediclaim B7 requirement) — the reviewer's remarks with
 * that detail stay in-app, not in the email.
 */
class MediclaimClaimReturnedMail extends Mailable
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
            subject: "Mediclaim claim {$this->claimNumber} needs correction",
        );
    }

    public function content(): Content
    {
        return new Content(
            view: 'emails.mediclaim.claim-returned',
            with: [
                'employeeName' => $this->employeeName,
                'claimNumber' => $this->claimNumber,
            ],
        );
    }
}
