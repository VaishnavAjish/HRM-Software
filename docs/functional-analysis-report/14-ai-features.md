# 15. AI Features

## 15.1 Finding: no AI/LLM integration exists in this codebase

A full sweep of both codebases (`.env.example`, all `config/*.php` files, `package.json` dependencies, and the services/controllers inventory) found:
- No AI/LLM API keys (OpenAI, Anthropic, Google, Azure OpenAI, etc.) in any configuration file.
- No AI/LLM client libraries in `package.json` or `composer.json`.
- No prompt templates, embeddings, vector store, or model-invocation code anywhere in `app/Services` or the frontend `src/utils`.

**This product has no AI features**, despite one UI element using AI-adjacent language:

## 15.2 "AI categorization" suggestion in Raise Ticket (`/employee/tickets/new`)

`RaiseTicket.jsx` includes a feature described in research as a "mock AI categorization" suggestion — proposing a ticket category based on the text the employee types into the subject field. This is a **mock**, client-side heuristic (keyword matching against `ticketMeta.js`'s department/category list) rather than a call to any real AI/ML service — confirmed by checking for (and finding none) any outbound API/fetch call tied to the suggestion.

This should **not** be described as "AI-powered" in any client-facing or registration document — "automated category suggestion" (heuristic-based) is the accurate framing.

## 15.3 Recommendation

If AI-assisted features (smart categorization, resume parsing/ATS scoring beyond the existing manual `ats_score` field, chatbot support, etc.) are part of the product roadmap, they would need to be built from scratch — there is no existing scaffolding, abstraction layer, or partial implementation to build on beyond this one heuristic suggestion.
