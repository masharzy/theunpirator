import argon2 from "argon2";
import { eq } from "drizzle-orm";
import { createDatabase } from "@unpirator/db";
import { accounts } from "@unpirator/db/schema";
const email = String(process.env.BOOTSTRAP_SUPER_ADMIN_EMAIL || "").toLowerCase();
const password = process.env.BOOTSTRAP_SUPER_ADMIN_PASSWORD || "";
if (!email || password.length < 12)
  throw new Error("Set BOOTSTRAP_SUPER_ADMIN_EMAIL and a 12+ char BOOTSTRAP_SUPER_ADMIN_PASSWORD");
const { db, client } = createDatabase();
try {
  const [existing] = await db.select().from(accounts).where(eq(accounts.email, email)).limit(1);
  const passwordHash = await argon2.hash(password, { type: argon2.argon2id });
  if (existing)
    await db
      .update(accounts)
      .set({ passwordHash, platformRole: "super_admin", status: "active", updatedAt: new Date() })
      .where(eq(accounts.id, existing.id));
  else await db.insert(accounts).values({ email, passwordHash, platformRole: "super_admin" });
  console.log(`Super admin ready: ${email}`);
} finally {
  await client.end();
}
