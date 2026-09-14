<?php

namespace App\Mail\Mediclaim;

use Illuminate\Bus\Queueable;
use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;
use Illuminate\Queue\SerializesModels;

/**
 * Sent to the employee when a settlement is recorded against their Mediclaim
 * claim — see MediclaimNotifier::settled(). Generic phrasing only: never the
 * diagnosis, hospital name, or document names on a claim (an explicit
 * Mediclaim B7 requirement); amounts are intentionally omitted too — the
 * employee reviews the exact figures in-app.
 */
class MediclaimClaimSettledMail extends Mailable
{
    use Queueable, SerializesModels;

    public function __construct(
        public string $employeeName,
        public string $claimNumber,
        public bool $fullySettled,
    ) {
    }

    public function envelope(): Envelope
    {
        return new Envelope(
            subject: "Settlement recorded for Mediclaim claim {$this->claimNumber}",
        );
    }

    public function content(): Content
    {
        return new Content(
            view: 'emails.mediclaim.claim-settled',
            with: [
                'employeeName' => $this->employeeName,
                'claimNumber' => $this->claimNumber,
                'fullySettled' => $this->fullySettled,
            ],
        );
    }
}
