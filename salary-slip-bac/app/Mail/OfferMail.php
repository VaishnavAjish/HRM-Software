<?php

namespace App\Mail;

use Illuminate\Bus\Queueable;
use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;
use Illuminate\Queue\SerializesModels;
use App\Models\Setting;

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
        
        $customBody = null;
        try {
            $templatesJson = Setting::where('key', 'hr.mail_templates')->value('value');
            if ($templatesJson) {
                $templates = json_decode($templatesJson, true);
                if (is_array($templates)) {
                    foreach ($templates as $tpl) {
                        if (isset($tpl['id']) && $tpl['id'] === 'offer') {
                            $customBody = $tpl['body'] ?? null;
                            break;
                        }
                    }
                }
            }
        } catch (\Exception $e) {
            // Ignore
        }

        if ($customBody) {
            $customBody = str_replace(
                ['{candidate_name}', '{designation}', '{ctc}', '{joining_date}', '{expiry_date}'],
                [$this->candidateName, $this->designation, $this->ctcFormatted, $this->joiningDateFormatted ?? 'TBD', $this->expiryDateFormatted ?? 'TBD'],
                $customBody
            );
        }

        return new Content(
            htmlString: view('emails.offer-letter', [
                'candidateName' => $this->candidateName,
                'designation' => $this->designation,
                'ctcFormatted' => $this->ctcFormatted,
                'joiningDateFormatted' => $this->joiningDateFormatted,
                'expiryDateFormatted' => $this->expiryDateFormatted,
            
                'customBody' => $customBody,
            ])->render(),
        );
    }
}
