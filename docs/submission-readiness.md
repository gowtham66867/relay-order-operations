# Submission readiness

Status: **NOT READY TO SUBMIT** until the external evidence below is complete.

## Implemented and locally testable

- Persistent intake, clarification, versioned proposals, separate customer acceptance and operator approval.
- Stock and pricing checks, supersession, cancellation, duplicate protection, concurrency checks.
- Explicit Meta/Baseten/Fireworks inference adapters with fixed destinations and no silent fallback.
- A verified WhatsApp adapter library using synthetic signed payloads; live ingress is not enabled.
- Automated tests and a deterministic evaluation report. These do not establish live model accuracy.

## Required evidence still missing

1. Configure a real inference key in Relay's hosted environment and run an eligible Meta model successfully. Record the response ID, provider/model, source evidence, and resulting workflow. Credits were reported available by the owner, but the Billing UI remained on “Loading billing…” during inspection; the credit balance was not independently verified.
2. Evaluate real model outputs against a labeled set. The current policy evaluation is deterministic demo parsing only.
3. Record and publish an accessible three-minute video. A script is available; a video URL is not.
4. Confirm the public GitHub URL contains the final source and an open-source license.
5. Confirm judges can access the demo. The app is intentionally owner-private; do not assume a private URL gives judges access.
6. Review the complete submission form and enter accurate team/project details. No submission has been sent.

## Production and pilot scope

Real WhatsApp receipt/reply, voice transcription, ERP updates, ERP timeout reconciliation, shared merchant tenancy, production roles, and measured merchant impact remain external-integration/pilot work. They are not completed capabilities of this release.

Custom domain verification is optional for the hackathon and is separate from model integration. Do not delay required evidence to polish DNS branding.
