# Stage 1B Meal Package V2 production release candidate

## Pre-change record — 2026-10-01

- **Existing system and authority:** Reviewed culinary source commit `8ca525c093bbd8b5119d48c0b8e07fd4d526aa4a` is deployed on isolated Stage 1B staging as Worker version `74249e82-1a6b-4f1e-a11c-33837c2c62a4`. `app.snapndish.com` runs the Stage 1A Worker version `8b68fce3-7845-412e-9c1a-80e78293d17b` with its own D1 database. The Worker owns conversation and accepted meal state; the customer owns decisions and actual cooking progress.
- **Authorized extension:** Make environment identification and the one-minute test reminder option configuration-driven. Add a production Wrangler configuration with the existing production Worker route and D1 ID, the Stage 1B migration directory, a distinct production image bucket binding, and the required secret *names*. Keep the culinary behavior, prompt, model, Shopping, cooking, and Talk It code unchanged.
- **Regression surface:** Stage 1A and Stage 1B rendering, protected owner review, reminders, D1 migration compatibility, photo storage, voice, conversation persistence, and rollback of the existing production Worker.
- **Proof plan:** Run complete local tests, preflight, bundle dry runs, and GitHub CI. Deploy the exact candidate to isolated Stage 1B staging and inspect the rendered conversation, Shopping, full plan, reload, Talk It initialization, and Access boundary. Verify production resource existence and independent bindings/secrets before any production mutation. Under production configuration, inspect generated HTML and `/health` for staging/test labels.
- **Expected staging behavior:** The Stage 1B staging Worker remains Access protected, uses its own D1/R2, identifies itself as staging, and retains the one-minute reminder test option. All meal behavior stays on `stage1b-meal-package-v2`.
- **Code/data rollback:** Stage 1B staging can roll back to Worker `74249e82-1a6b-4f1e-a11c-33837c2c62a4` if still active/available at deployment time. Production must retain Worker `8b68fce3-7845-412e-9c1a-80e78293d17b` as the immediate code rollback target. D1 migrations must be append-only; record a D1 Time Travel bookmark before applying them. Worker rollback does not reverse D1.

## Release observations

Pending. Record exact commits, Worker versions, resource checks, tests, CI, rendered staging/production verification, and any unresolved gate here without copying private conversations or secrets.
