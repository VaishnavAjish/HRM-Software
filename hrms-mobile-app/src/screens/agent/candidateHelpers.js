export const TYPE_VARIANT = {
  appointment: 'emerald',
  trial: 'amber',
  pending_employee: 'violet',
};

export function typeLabel(type) {
  if (type === 'appointment') return 'Appointment';
  if (type === 'trial') return 'Trial Form';
  if (type === 'pending_employee') return 'Pending';
  return 'Candidate';
}

export function isCandidateApproved(c) {
  return Boolean(c.emp_code) || Number(c.checkbox) === 1 || String(c.status) === '1' || c.status === 'Approved';
}

export function isCandidateProcessed(c) {
  return Number(c.processed) === 1;
}

export function canProcess(c) {
  return c.type === 'trial' && isCandidateApproved(c) && !isCandidateProcessed(c);
}
