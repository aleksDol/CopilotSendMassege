# @repo/db

Prisma database package for the AI Sales Assistant monorepo.

## Commands
- `pnpm --filter @repo/db prisma:generate`
- `pnpm --filter @repo/db prisma:migrate`
- `pnpm --filter @repo/db prisma:migrate:deploy`
- `pnpm --filter @repo/db prisma:seed`
- `pnpm --filter @repo/db prisma:studio`

## Notes
- First migration is in `prisma/migrations/20260315153000_init_v1`.
- Telegram login-state migration is in `prisma/migrations/20260315170000_telegram_login_states`.
- Seed creates a demo company, owner user, and default reply policy.
