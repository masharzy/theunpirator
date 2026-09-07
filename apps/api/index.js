// Temporary Vercel entry point. Delete this file when the API moves to a VPS.
// The VPS entry point remains src/server.js and is not changed by this adapter.
import "./src/startup/providers.js";
import { createApp } from "./src/app.js";

const { app } = createApp();

export default app;
