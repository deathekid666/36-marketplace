import assert from "node:assert/strict";

import { discoverySnapshotMetrics } from "../lib/discovery/metrics";

assert.deepEqual(
  discoverySnapshotMetrics({
    candidates: 100,
    approved: 10,
    converted: 5,
    claimsVerified: 5,
    claimsRejected: 5,
  }),
  {
    candidateApprovalRatio: 15,
    claimVerificationRatio: 50,
    verifiedClaimToOnboardingRatio: 100,
  },
);

assert.deepEqual(
  discoverySnapshotMetrics({
    candidates: 0,
    approved: 0,
    converted: 0,
    claimsVerified: 0,
    claimsRejected: 0,
  }),
  {
    candidateApprovalRatio: 0,
    claimVerificationRatio: 0,
    verifiedClaimToOnboardingRatio: 0,
  },
);

console.log("D15 discovery analytics fixtures passed");
