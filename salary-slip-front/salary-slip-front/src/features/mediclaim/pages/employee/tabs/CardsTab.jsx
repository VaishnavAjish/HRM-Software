import CardViewer from "../../../components/CardViewer";

/**
 * `CardViewer` fetches `myCards()` itself (cards aren't part of the shared
 * `useMediclaimLookups` preload — coverage cards change far less often than
 * they're viewed, and only this one tab needs them), so this wrapper is
 * intentionally just pass-through.
 */
export default function CardsTab() {
  return <CardViewer />;
}
