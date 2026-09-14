import Stepper from "../../../components/onboarding/Stepper";
import { WIZARD_STEPS, getWizardStepIndex } from "../models/wizardSteps";

/**
 * Thin wrapper around the existing (purely presentational) `Stepper` —
 * this component's only job is turning the wizard's current step key into
 * the `{label, caption, state}` list `Stepper` expects. The caller
 * (`SubmitClaimTab`) still owns the active step; this never navigates on
 * its own.
 */
export default function ClaimStepper({ currentStep }) {
  const currentIndex = getWizardStepIndex(currentStep);

  const steps = WIZARD_STEPS.map((step, index) => ({
    label: step.label,
    caption: step.sectionLabel,
    state: index < currentIndex ? "done" : index === currentIndex ? "now" : undefined,
  }));

  return <Stepper steps={steps} />;
}
