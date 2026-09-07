# One-time platform bootstrap

1. Apply database migrations.
2. Temporarily set `BOOTSTRAP_SUPER_ADMIN_EMAIL` and `BOOTSTRAP_SUPER_ADMIN_PASSWORD`.
3. Run `pnpm --filter @unpirator/api bootstrap:admin` once.
4. Sign in as that account and open **Dashboard → Account**. Add the shown secret to a TOTP authenticator and confirm a six-digit code. Admin routes remain locked until this succeeds.
5. In **Admin → Accounts**, create or find a second account. The account holder must use the emailed setup link, set a password, and verify ownership of the address.
6. Promote the second account with a written reason. The second admin signs in, completes authenticator setup, and confirms independent Admin access.
7. When two active MFA-confirmed super admins exist, `platform_bootstrap_state.completed_at` is set automatically. Future bootstrap runs are refused.
8. Remove both bootstrap variables from production.

The API rejects demoting or disabling an active super admin when that would leave fewer than two. Account access changes require MFA within the previous 15 minutes, record the supplied reason in the audit log, and notify the affected address.

## Emergency recovery

Use database recovery only when every permanent administrator is locked out. Restore a recent backup first, record an incident ticket, and have two operators approve the recovery. A database operator may clear `platform_bootstrap_state.completed_at`, run the bootstrap command with newly generated temporary credentials, and immediately restore two MFA-confirmed administrators. Record the recovery in the audit log and remove the temporary credentials. Never leave bootstrap variables configured after recovery.
