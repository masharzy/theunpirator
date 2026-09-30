import { createDatabase } from "@unpirator/db";
import { createLogger } from "@unpirator/logger";
import { expireDeadWebFindings, runPiracyScan } from "../services/piracy-scanner.js";

const logger = createLogger({ service: "piracy-scan-job" });
const { db, client } = createDatabase();
try {
  const summary = await runPiracyScan({ db, logger });
  const webCheck = await expireDeadWebFindings({ db, logger });
  console.log(
    `Piracy scan complete: ${summary.scanned} sources scanned, ` +
      `${summary.newFindings} new findings, ${summary.updatedFindings} refreshed, ` +
      `${summary.errors} source errors; web recheck closed ${webCheck.expired}/${webCheck.checked}`,
  );
} finally {
  await client.end();
}
