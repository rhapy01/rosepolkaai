# Security and Audit Plan

## Current security foundations

- OpenZeppelin-based contract composition
- Role-based access controls for sensitive operations
- Pause controls for emergency response
- Reentrancy protections on execution-critical paths
- Policy-based execution design for allowlisted targets/selectors

## Near-term hardening checklist

- Expand unit and integration coverage for:
  - token launch factory and token tax/burn behavior
  - bridge edge cases and replay protections
  - fee routing correctness and invariants
- Add formalized threat model:
  - user wallet risk
  - bridge relayer trust assumptions
  - admin-key and role-management risk
- Add contract-level invariants and negative-path tests

## Audit preparation

- Prepare auditor packet:
  - architecture overview
  - trust assumptions
  - deployment and upgrade notes
  - privileged role map
  - known limitations
- Conduct internal pre-audit review and issue triage
- Engage external review after pre-audit fixes

## Operational security

- Keep deployment keys isolated and rotated as needed
- Use environment-specific addresses and avoid hardcoded production secrets
- Define incident response process for pausing and remediation

## User safety communication

- Clearly state demo vs production trust assumptions
- Provide risk notes in chat before execution
- Encourage users to verify chain/token/amount before signing

