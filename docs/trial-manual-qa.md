# Trial Manual QA

Use these steps to manually verify `trial`, `trial expiring`, and `trial expired` states.

## 1) Identify company and latest subscription

```sql
SELECT id, name, slug FROM "Company" ORDER BY "createdAt" DESC LIMIT 20;

SELECT id, "companyId", status, plan, "trialStartedAt", "trialEndsAt", "currentPeriodEnd"
FROM "Subscription"
WHERE "companyId" = '<COMPANY_ID>'
ORDER BY "createdAt" DESC
LIMIT 1;
```

## 2) Force Trial Active (about 2 days left)

```sql
UPDATE "Subscription"
SET
  status = 'TRIALING',
  plan = 'FREE',
  "trialStartedAt" = NOW() - INTERVAL '1 day',
  "trialEndsAt" = NOW() + INTERVAL '2 day',
  "currentPeriodStart" = NOW() - INTERVAL '1 day',
  "currentPeriodEnd" = NOW() + INTERVAL '2 day'
WHERE id = '<SUBSCRIPTION_ID>';
```

Expected UI:
- Global banner says trial is active and shows remaining days
- Billing page shows `Пробный период`, not `FREE`
- Usage card does not show FREE-limit copy as primary state

## 3) Force Trial Expiring (1 day left)

```sql
UPDATE "Subscription"
SET
  status = 'TRIALING',
  "trialEndsAt" = NOW() + INTERVAL '23 hour',
  "currentPeriodEnd" = NOW() + INTERVAL '23 hour'
WHERE id = '<SUBSCRIPTION_ID>';
```

Expected UI:
- Banner and billing state switch to expiring tone
- Copy indicates trial ends soon

## 4) Force Trial Expired

```sql
UPDATE "Subscription"
SET
  status = 'TRIALING',
  "trialEndsAt" = NOW() - INTERVAL '1 hour',
  "currentPeriodEnd" = NOW() - INTERVAL '1 hour'
WHERE id = '<SUBSCRIPTION_ID>';
```

Expected UI:
- Banner says trial ended
- Dashboard shows paywall card
- AI/send actions show inline upgrade notice
- Data/chats remain visible

## 5) Restore paid/free state

Paid example:

```sql
UPDATE "Subscription"
SET
  status = 'ACTIVE',
  plan = 'PRO',
  "currentPeriodEnd" = NOW() + INTERVAL '30 day'
WHERE id = '<SUBSCRIPTION_ID>';
```

Free example:

```sql
UPDATE "Subscription"
SET
  status = 'CANCELED',
  plan = 'FREE',
  "trialEndsAt" = NULL,
  "trialStartedAt" = NULL
WHERE id = '<SUBSCRIPTION_ID>';
```

After updates, refresh app and re-open billing/chats/dashboard.
