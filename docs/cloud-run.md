# Cloud Run deployment

The private `relay-order-operations` service runs in Google Cloud project `billing-dashboard-505116`, region `asia-south1`, under the texmed.us account. Its separate `relay` Firestore database stores versioned workspaces. Runtime IAM grants access only to this database and the dedicated model secret. Cloud Run IAM controls invocation; the Node adapter strips incoming Sites identity headers and serves one owner workspace.

Service: https://relay-order-operations-mb3wwhqg6q-el.a.run.app

This URL requires an IAM identity token. Ordinary direct browser navigation does not supply one. For owner browser use, run:

```sh
gcloud run services proxy relay-order-operations \
  --project=billing-dashboard-505116 --region=asia-south1 --port=4180
```

Then open http://127.0.0.1:4180. This exact local origin is permitted for mutations. Other cross-origin requests are rejected. Keep this proxy bound to loopback. The service is private and is not intended as a public multiuser deployment.

## Redeploy

```sh
npm ci
npm test
gcloud run deploy relay-order-operations \
  --project=billing-dashboard-505116 --region=asia-south1 --source=. \
  --service-account=relay-runtime@billing-dashboard-505116.iam.gserviceaccount.com \
  --no-allow-unauthenticated \
  --set-env-vars=FIRESTORE_DATABASE=relay,GOOGLE_CLOUD_PROJECT=billing-dashboard-505116,META_PROVIDER=meta,META_MODEL=muse-spark-1.3,LOCAL_PROXY_ORIGIN=http://127.0.0.1:4180 \
  --set-secrets=MODEL_API_KEY=RELAY_META_API_KEY:1 \
  --memory=512Mi --cpu=1 --min-instances=0 --max-instances=2 \
  --concurrency=20 --timeout=120
```

The image excludes local artifacts and credentials, runs as the Node user, and binds to Cloud Run's injected PORT on 0.0.0.0. No service-account key files are used. Google Cloud hosting costs are separate from Meta API credits. The adapter rejects workspaces approaching Firestore's document limit; export/reset the synthetic workspace before reaching that bound.

See `cloud-run-verification.json` for real hosted inference, acceptance, approval, reload, deduplication and access checks. Custom-domain DNS is separate and has not been configured.
