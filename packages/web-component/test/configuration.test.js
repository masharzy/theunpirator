import assert from "node:assert/strict";
import test from "node:test";
import { UnpiratorPlayerElement } from "../src/index.js";

test("remounts when asynchronous authorization callbacks change", () => {
  const element = Object.create(UnpiratorPlayerElement.prototype);
  let mounts = 0;
  element.mount = () => mounts++;
  Object.defineProperty(element, "isConnected", { value: true });
  const getHeaders = async () => ({ authorization: "Bearer test" });
  const getAccessToken = async () => "test";

  element.getHeaders = getHeaders;
  element.getAccessToken = getAccessToken;

  assert.equal(element.getHeaders, getHeaders);
  assert.equal(element.getAccessToken, getAccessToken);
  assert.equal(mounts, 2);
});

test("stores static request headers for server-authenticated endpoints", () => {
  const element = Object.create(UnpiratorPlayerElement.prototype);
  Object.defineProperty(element, "isConnected", { value: false });
  const headers = { "x-site-token": "test" };

  element.headers = headers;

  assert.equal(element.headers, headers);
});

test("does not expose a trusted browser viewer identity property", () => {
  assert.equal(
    Object.getOwnPropertyDescriptor(UnpiratorPlayerElement.prototype, "currentUser"),
    undefined,
  );
});
