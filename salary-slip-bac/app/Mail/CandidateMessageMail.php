<?php

namespace App\Mail;

use Illuminate\Bus\Queueable;
use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;
use Illuminate\Queue\SerializesModels;
use App\Models\Setting;

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
        
        $customBody = null;
        try {
            $templatesJson = Setting::where('key', 'hr.mail_templates')->value('value');
            if ($templatesJson) {
                $templates = json_decode($templatesJson, true);
                if (is_array($templates)) {
                    foreach ($templates as $tpl) {
                        if (isset($tpl['id']) && $tpl['id'] === 'message') {
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
                ['{candidate_name}', '{message}'],
                [$this->candidateName, $this->bodyText],
                $customBody
            );
        }

        return new Content(
            htmlString: view('emails.candidate-message', [
                'candidateName' => $this->candidateName,
                'body' => $this->body,
            
                'customBody' => $customBody,
            ])->render(),
        );
    }
}