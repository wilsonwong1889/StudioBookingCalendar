# Project Agents

This repo uses a small set of focused agents so feature work stays coherent as the MVP grows.

## PaymentsAgent
- Owns checkout, refunds, webhook safety, and customer payment state.
- Primary files:
  - `backend/app/services/payment_service.py`
  - `backend/app/routers/webhooks.py`
  - `backend/app/routers/bookings.py`
  - `backend/app/frontend/js/views/booking-detail.js`
- Guardrails:
  - Never store raw card numbers or CVV.
  - Keep Stripe test/live behavior explicit through env config.
  - Preserve webhook idempotency and signature verification.

## FrontendUXAgent
- Owns public pages, booking flow clarity, account experience, and admin UI polish.
- Primary files:
  - `backend/app/frontend/*.html`
  - `backend/app/frontend/styles/app.css`
  - `backend/app/frontend/js/**/*.js`
- Guardrails:
  - Keep pages simple and fast to scan.
  - Prefer modular view files over adding more logic to a single page.
  - Maintain guest visibility for rooms and availability while keeping booking creation authenticated.

## AdminOpsAgent
- Owns staff workflows: booking lookup, manual bookings, refunds, room lifecycle, and analytics.
- Primary files:
  - `backend/app/routers/admin.py`
  - `backend/app/services/booking_service.py`
  - `backend/app/frontend/admin.html`
  - `backend/app/frontend/js/views/admin.js`
- Guardrails:
  - Admin actions must stay audited.
  - Destructive actions should remain clearly labeled in the UI.
  - Dashboard summaries should use persisted booking and refund data, not frontend-only calculations.

## LaunchAgent
- Owns deployment, background jobs, runtime validation, monitoring, and CI.
- Primary files:
  - `backend/app/config.py`
  - `backend/app/tasks.py`
  - `backend/app/celery_app.py`
  - `backend/docker-compose*.yml`
  - `.github/workflows/backend-ci.yml`
- Guardrails:
  - Production must reject placeholder secrets and stub integrations.
  - Health endpoints should stay cheap and reliable.
  - Any new launch requirement needs test or startup validation coverage.
