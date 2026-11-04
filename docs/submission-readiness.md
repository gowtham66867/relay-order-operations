# Submission record

Relay was submitted to the Meta Global AI Developer Hackathon on November 4, 2026.

- Entry ID: `a35eaa1b-c8d0-4558-90b2-f1ec508a0123`
- Track: Indie Developer / Build for Your World
- Submission: https://cerebralvalley.ai/e/meta-ai-developer-hackathon/hackathon/a35eaa1b-c8d0-4558-90b2-f1ec508a0123/edit
- Public MIT source: https://github.com/gowtham66867/relay-order-operations
- Public three-minute video: https://github.com/gowtham66867/relay-order-operations/releases/download/demo-v1/relay-demo.mp4

The portal returned a “View Submission” link and the saved “Your Submission” page. The user explicitly approved the materials promotion permission and the required opinion answers. The video is an edited screen walkthrough with synthetic narration, synthetic business data, and actual Meta inference.

## Evidence

- 35 automated tests and 20 deterministic scenario evaluations passed.
- Six synthetic live-model scenarios passed; see `live-evaluation.json`. These are integration checks, not a production accuracy estimate.
- Actual Meta response metadata is visible in the app and public reports. Free credits were confirmed; calls succeeded without adding a payment method.
- Cloud Run deployment uses Firestore transactions and Google Secret Manager. Eleven hosted workflow/access checks passed; see `cloud-run-verification.json`.
- Operational hosted workspaces remain private. Judges can review the public video and runnable source without access to a paid inference secret.

## Scope

Real WhatsApp receipt/reply, voice transcription, ERP updates, ERP timeout reconciliation, shared merchant tenancy, production roles, and measured merchant impact remain future integration and pilot work. No real customer message or production ERP mutation occurs in this prototype.
