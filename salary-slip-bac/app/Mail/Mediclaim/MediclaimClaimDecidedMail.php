<?php

namespace App\Mail\Mediclaim;

use Illuminate\Bus\Queueable;
use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;
use Illuminate\Queue\SerializesModels;

/**
 * Sent to the employee for a rejecting manager decision or any director
 * final decision on their Mediclaim claim — see
 * MediclaimNotifier::managerDecided()/directorDecided(). `$outcome` is one
 * of 'approved'|'partially_approved'|'rejected'. Generic phrasing only:
 * never the diagnosis, hospital name, or document names on a claim (an
 * explicit Mediclaim B7 requirement).
 */
class MediclaimClaimDecidedMail extends Mailable
{
    use Queueable, SerializesModels;

    public function __construct(
        public string $employeeName,
        public string $claimNumber,
        public string $outcome,
    ) {
    }

    public function envelope(): Envelope
    {
        return new Envelope(
            subject: "Mediclaim claim {$this->claimNumber} — decision recorded",
        );
    }

    public function content(): Content
    {
        $label = match ($this->outcome) {
            'approved' => 'approved',
            'partially_approved' => 'partially approved',
            default => 'rejected',
        };

        return new Content(
            view: 'emails.mediclaim.claim-decided',
            with: [
                'employeeName' => $this->employeeName,
                'claimNumber' => $this->claimNumber,
                'outcomeLabel' => $label,
                'isRejected' => $label === 'rejected',
            ],
        );
    }
}
