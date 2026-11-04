# Submission readiness

Status: **NOT READY TO SUBMIT** until the external evidence below is complete.

## Implemented and locally testable

- Persistent intake, clarification, versioned proposals, separate customer acceptance and operator approval.
- Stock and pricing checks, supersession, cancellation, duplicate protection, concurrency checks.
- Explicit Meta/Baseten/Fireworks inference adapters with fixed destinations and no silent fallback.
- A verified WhatsApp adapter library using synthetic signed payloads; live ingress is not enabled.
- Automated tests and a deterministic evaluation report. These do not establish live model accuracy.

## Required evidence still missing

1. **Complete:** a dedicated Meta key is stored as a hosted secret. Muse Spark 1.3 returned real responses; see `live-smoke.json`. Free credits were confirmed and inference succeeded without adding a payment method.
2. **Complete, limited scope:** six synthetic live-model scenarios passed; see `live-evaluation.json`. This is an integration evaluation, not a production accuracy estimate.
3. Record and publish an accessible three-minute video. A script is available; a video URL is not.
4. Public source created: https://github.com/gowtham66867/relay-order-operations (MIT license). Verify final checks after publication.
5. Confirm judges can access the demo. The app is intentionally owner-private; do not assume a private URL gives judges access.
6. Review the complete submission form and enter accurate team/project details. No submission has been sent.

## Production and pilot scope

Real WhatsApp receipt/reply, voice transcription, ERP updates, ERP timeout reconciliation, shared merchant tenancy, production roles, and measured merchant impact remain external-integration/pilot work. They are not completed capabilities of this release.

Custom domain verification is optional for the hackathon and is separate from model integration. Do not delay required evidence to polish DNS branding.
