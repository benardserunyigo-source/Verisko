// Crew above the package allowance must be approved by the Owner, not by a
// client-provided approval flag. Approval is tied to camera count and amount.
export function guardCrewApprovals(stored, incoming, isAdmin, email, now = new Date().toISOString()) {
  const previous = new Map((stored || []).map(j => [j.id,j]));
  return (incoming || []).map(j => {
    if (!j || !j.pricingVersion || j.extraCrewCost == null) return j;
    const amount = Math.max(0,Number(j.extraCrewCost)||0), key = amount > 0 ? `${Number(j.cameraCount)}:${amount}` : '';
    const prev = previous.get(j.id) || {};
    const alreadyApproved = !!key && prev.crewApprovalKey === key && !!prev.crewApprovedBy;
    const approveNow = !!key && isAdmin && j.crewApprovalKey === key;
    const approved = alreadyApproved || approveNow;
    if (key && !approved && j.stage !== 'Draft') throw new Error('Owner approval is required for extra crew. Save this job as Draft.');
    const out = { ...j, crewApprovalKey: approved ? key : '', crewApprovedBy: approved ? (alreadyApproved ? prev.crewApprovedBy : email) : '', crewApprovedAt: approved ? (alreadyApproved ? prev.crewApprovedAt : now) : '' };
    if(out.quoteSnapshot) out.quoteSnapshot = { ...out.quoteSnapshot, needsApproval: !!key && !approved, crewApprovalKeyRequired: key };
    return out;
  });
}
