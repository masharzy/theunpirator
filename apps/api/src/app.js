// Vercel's Express detector recognizes src/app.js and requires the Express
// application itself as the module's default export.
import "express";
import "./startup/providers.js";
import { createApp } from "./create-app.js";

const { app } = createApp();

export default app;
