# Simulated Funds Disbursement

**Status:** Draft v0.1  
**Scope:** Demonstration only; no real offer, account verification, payment rail,
or funds movement

## 1. Objective

Extend an eligible personal-loan demonstration from outcome through simulated
offer acceptance and funding confirmation. The experience should look complete
without creating a mechanism that can send money or collect real bank details.

Use **disbursement** for the release of loan funds. “Dispersal” is not used in
product copy.

## 2. Eligibility

An application can enter the flow only when:

- required documents have passed or completed review;
- applicant verification and submission are complete;
- affordability is `affordable`;
- the outcome is `indicatively approved`, or a `referred` outcome has a recorded
  demonstration-operator approval;
- final pricing and repayments have been calculated; and
- there is no completed disbursement for the accepted offer.

Not-approved, withheld, unaffordable, marginal, unaccepted, failed-document, and
cancelled applications cannot produce a completed disbursement.

## 3. Applicant flow

1. Review the simulated offer summary.
2. Acknowledge that it is illustrative and not a real credit contract.
3. Accept the simulated offer.
4. Select an applicant-owned synthetic account already represented in the
   application data.
5. Confirm only masked BSB and account details.
6. View a short simulated processing state.
7. View either a completed confirmation or a recoverable failure.

The confirmation shows approved principal, destination account mask, simulated
transfer reference, completion time, and the persistent statement **Simulation
only—no money was transferred**.

## 4. Offer contents

The accepted snapshot includes:

- principal;
- term in whole years;
- pricing tier and nominal annual rate;
- AUD 15 monthly fee;
- repayment frequency and amount;
- total number of repayments;
- total fees and total repayable;
- acceptance timestamp; and
- methodology versions used for affordability, score, and pricing.

Later changes to product configuration cannot alter an accepted fixture offer.

## 5. Disbursement rules

- Simulate the full approved principal; do not deduct the monthly fee.
- Use AUD only.
- Create no network integration, payment instruction, downloadable bank file, or
  real beneficiary record.
- Use generated synthetic account identifiers and masked display values.
- Prefix every transfer reference with `SIM-`.
- Use an idempotency key derived from the accepted `offer_id`; at most one
  disbursement can reach `completed`.
- A retry continues the same `disbursement_id` and preserves prior attempts.
- Completed records are immutable; corrections require a new audit event rather
  than editing the original event.

## 6. State model

```text
not_ready → ready → processing → completed
                         │
                         ├→ failed → processing
                         └→ cancelled
```

- `ready`: accepted offer and destination account are present.
- `processing`: a simulated attempt has started.
- `completed`: the simulation records one fictional transfer.
- `failed`: a recoverable synthetic operational failure; no funds movement.
- `cancelled`: applicant or operator ended the simulation before completion.

## 7. Demonstration scenarios

- **Scenario A:** completes on the first attempt.
- **Scenario E:** first attempt fails with a synthetic destination-validation
  error, then succeeds using the same offer and disbursement identifiers.
- **Scenarios B and F:** remain blocked while referred.
- **Scenarios C, D, and G:** remain blocked pending document review.
- **Scenario H:** remains blocked because it is not approved.

## 8. Audit and reconciliation

Record append-only events for offer presented, disclaimer acknowledged, offer
accepted, destination confirmed, processing started, attempt failed, retry
started, completed, and cancelled.

For every completed fixture:

- exactly one completed disbursement exists per accepted offer;
- amount equals approved principal;
- currency is AUD;
- transfer reference is unique and starts with `SIM-`;
- destination refers to an applicant-owned synthetic account; and
- timestamps follow the expected event order.

The demonstration ledger records equal fictional entries for the loan receivable
and simulated cash outflow. These entries are internal fixtures only and must
never be exported as payment instructions.
