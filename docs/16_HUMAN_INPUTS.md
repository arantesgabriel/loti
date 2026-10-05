# Human Inputs / Genuine Blockers

The implementation agent should not invent these values. They can be supplied at deployment/bootstrap time.

## Production identity inputs

For each initial member:

- display name;
- email address;
- initial password or secure password-reset/bootstrap process.

Initial names are known conceptually: Gabriel, Brunna, Amanda, Bola, Vinicius. Real production emails/passwords are not part of this spec.

## Better Auth

- `BETTER_AUTH_SECRET`;
- final `BETTER_AUTH_URL` once production URL is known.

## Railway

Human may need to:

- authenticate/connect Railway account;
- create/select project;
- attach persistent volume;
- approve domain/custom-domain settings;
- configure backup retention/settings depending on plan/UI.

## Legacy migration

The operator must confirm at execution time whether the workbook's `Compra Out26` still represents the active purchase or should be imported as history.

The migration also needs a reliable mapping from legacy person labels to created Better Auth users.

## What is NOT a blocker

The agent must not stop for:

- ordinary code errors;
- unclear naming that is already resolved by these docs;
- deciding between Supabase/Neon/SQLite;
- design choice already represented by mockups;
- missing real product images;
- needing a new product-archetype fallback;
- test failures.

Those should be solved autonomously.
