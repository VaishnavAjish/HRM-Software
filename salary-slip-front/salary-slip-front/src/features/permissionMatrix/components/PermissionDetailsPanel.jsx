import { useState } from "react";
import { Check, Copy, Info } from "lucide-react";
import Card from "../../../components/ui/Card";
import { StateBadge, TypeBadge } from "./badges";
import { REASON_LABEL, SENSITIVITY_META, SOURCE_LABEL } from "../models/permissionStates";

function Row({ label, children }) {
  return (
    <div className="flex gap-3 py-1">
      <dt className="w-32 shrink-0 text-xs text-gray-500 dark:text-gray-400">{label}</dt>
      <dd className="min-w-0 flex-1 text-xs text-gray-900 dark:text-gray-100">{children ?? "—"}</dd>
    </div>
  );
}

function CopyableCode({ value }) {
  const [copied, setCopied] = useState(false);

  if (!value) return "—";

  return (
    <span className="flex items-center gap-1.5">
      <code className="truncate font-mono text-[11px]">{value}</code>
      <button
        type="button"
        aria-label="Copy permission code"
        className="shrink-0 rounded p-0.5 text-gray-400 hover:text-brand-600 dark:hover:text-brand-400"
        onClick={() => {
          navigator.clipboard?.writeText(value);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        }}
      >
        {copied ? <Check size={12} aria-hidden="true" /> : <Copy size={12} aria-hidden="true" />}
      </button>
    </span>
  );
}

export default function PermissionDetailsPanel({ node, draftState, roleName, lastChange }) {
  if (!node) {
    return (
      <Card>
        <h2 className="flex items-center gap-2 text-sm font-semibold text-gray-900 dark:text-white">
          <Info size={16} className="text-brand-500" aria-hidden="true" /> Permission Details
        </h2>
        <p className="mt-3 text-xs text-gray-500 dark:text-gray-400">
          Select a row to see what grants it, where it is inherited from, and which endpoints it protects.
        </p>
      </Card>
    );
  }

  const configured = draftState ?? node.configuredState;
  const sensitivity = SENSITIVITY_META[node.sensitivity];
  const moduleLabel = node.key.split(".").slice(0, 3).join(" / ");

  return (
    <Card>
      <div className="flex items-start justify-between gap-3">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-gray-900 dark:text-white">
          <Info size={16} className="text-brand-500" aria-hidden="true" /> Permission Details
        </h2>
        {node.assignable && <StateBadge state={configured} pending={draftState !== undefined} />}
      </div>

      <p className="mt-3 text-base font-semibold text-gray-900 dark:text-white">{node.label}</p>

      <dl className="mt-3 divide-y divide-gray-100 dark:divide-gray-700/60">
        <Row label="Permission Code"><CopyableCode value={node.permissionCode} /></Row>
        <Row label="Type"><TypeBadge type={node.type} /></Row>
        <Row label="Module / Page">{moduleLabel}</Row>
        <Row label="Description">{node.description}</Row>
        <Row label="Sensitivity">
          <span className={sensitivity?.tone}>{sensitivity?.label ?? node.sensitivity}</span>
        </Row>
        <Row label="Configured State">
          {node.assignable ? <StateBadge state={configured} /> : "Grouping row"}
        </Row>
        <Row label="Effective Result">
          {node.assignable
            ? (draftState !== undefined
                ? <span className="text-amber-600 dark:text-amber-400">Recalculated on save</span>
                : <StateBadge state={node.effectiveResult} />)
            : "—"}
        </Row>
        <Row label="Why">{REASON_LABEL[node.reason] ?? node.reason}</Row>
        <Row label="Source">{SOURCE_LABEL[node.source] ?? node.source}</Row>
        <Row label="Inherited From">
          {node.inheritedFromRoleId ? `Role #${node.inheritedFromRoleId}` : "—"}
        </Row>
        <Row label="Blocked By">
          {node.blockedBy
            ? <code className="font-mono text-[11px] text-red-600 dark:text-red-400">{node.blockedBy}</code>
            : "—"}
        </Row>
        <Row label="Conditions">
          {node.conditionCount > 0 ? `${node.conditionCount} condition(s) must hold` : "—"}
        </Row>
        <Row label="Requires">
          {node.requiredCodes?.length
            ? (
              <ul className="space-y-0.5">
                {node.requiredCodes.map((code) => (
                  <li key={code} className="truncate font-mono text-[11px] text-gray-500 dark:text-gray-400">{code}</li>
                ))}
              </ul>
            )
            : "—"}
        </Row>
        <Row label="Scope">
          {node.scopes?.length ? node.scopes.join(", ") : "Company default"}
        </Row>
        <Row label="Frontend Route">
          {node.route ? <code className="font-mono text-[11px]">{node.route}</code> : "—"}
        </Row>
        <Row label="Backend">
          {node.impliedCodes?.length
            ? (
              <ul className="space-y-0.5">
                {node.impliedCodes.map((code) => (
                  <li key={code} className="truncate font-mono text-[11px] text-gray-500 dark:text-gray-400">{code}</li>
                ))}
              </ul>
            )
            : "—"}
        </Row>
        <Row label="Endpoints">
          {node.api?.length
            ? (
              <ul className="space-y-0.5">
                {node.api.map((endpoint) => (
                  <li key={`${endpoint.method}-${endpoint.path}`} className="font-mono text-[11px] text-gray-500 dark:text-gray-400">
                    <span className="font-semibold">{endpoint.method}</span> {endpoint.path}
                  </li>
                ))}
              </ul>
            )
            : "—"}
        </Row>
        <Row label="Last Changed By">{lastChange?.actorName ?? "—"}</Row>
        <Row label="Last Changed On">
          {lastChange?.changedAt ? new Date(lastChange.changedAt).toLocaleString() : "—"}
        </Row>
      </dl>

      {node.sensitivity === "CRITICAL" && (
        <p className="mt-3 rounded-lg bg-red-50 p-2.5 text-[11px] text-red-800 dark:bg-red-500/10 dark:text-red-300">
          Critical permission. Granting it on <span className="font-semibold">{roleName}</span> is audited with your name and reason.
        </p>
      )}
    </Card>
  );
}
