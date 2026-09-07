import argon2 from "argon2";
import { eq } from "drizzle-orm";
import { createDatabase } from "@unpirator/db";
import { accounts, platformBootstrapState } from "@unpirator/db/schema";
import { emailSchema, passwordSchema } from "@unpirator/contracts";
const email = emailSchema.parse(process.env.BOOTSTRAP_SUPER_ADMIN_EMAIL);
const password = passwordSchema.parse(process.env.BOOTSTRAP_SUPER_ADMIN_PASSWORD);
const { db, client } = createDatabase();
try {
  const [state] = await db
    .select()
    .from(platformBootstrapState)
    .where(eq(platformBootstrapState.id, "platform"))
    .limit(1);
  if (state?.completedAt)
    throw new Error(
      `Platform bootstrap was permanently completed at ${state.completedAt.toISOString()}`,
    );
  const [existing] = await db.select().from(accounts).where(eq(accounts.email, email)).limit(1);
  const passwordHash = await argon2.hash(password, { type: argon2.argon2id });
  if (existing)
    await db
      .update(accounts)
      .set({ passwordHash, platformRole: "super_admin", status: "active", updatedAt: new Date() })
      .where(eq(accounts.id, existing.id));
  else await db.insert(accounts).values({ email, passwordHash, platformRole: "super_admin" });
  await db
    .insert(platformBootstrapState)
    .values({ id: "platform", bootstrapVersion: 1 })
    .onConflictDoNothing();
  console.log(`Super admin ready: ${email}`);
} finally {
  await client.end();
}
