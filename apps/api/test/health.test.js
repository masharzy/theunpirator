import { describe, expect, it } from "vitest";
import request from "supertest";
import express from "express";
import { healthRouter } from "../src/routes/health.js";

describe("health", () => {
  it("reports liveness without dependencies", async () => {
    const app = express();
    app.use(
      "/health",
      healthRouter({ dbClient: async () => {}, cache: { ping: async () => "PONG" } }),
    );
    const response = await request(app).get("/health/live");
    expect(response.status).toBe(200);
    expect(response.body.status).toBe("ok");
  });
});
