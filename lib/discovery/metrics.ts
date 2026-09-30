export type DiscoverySnapshotCounts = {
  candidates: number;
  approved: number;
  converted: number;
  claimsVerified: number;
  claimsRejected: number;
};

function percent(numerator: number, denominator: number) {
  if (denominator <= 0) return 0;
  return Math.round((numerator / denominator) * 100);
}

export function discoverySnapshotMetrics(input: DiscoverySnapshotCounts) {
  const acceptedCandidates = input.approved + input.converted;
  const claimDecisions = input.claimsVerified + input.claimsRejected;

  return {
    candidateApprovalRatio: percent(acceptedCandidates, input.candidates),
    claimVerificationRatio: percent(input.claimsVerified, claimDecisions),
    verifiedClaimToOnboardingRatio: percent(
      input.converted,
      input.claimsVerified,
    ),
  };
}
