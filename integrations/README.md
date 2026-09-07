# Framework integrations

These thin adapters demonstrate the intended integration contract: the customer backend verifies course access, then calls `/v1/playback/sessions` with its secret API key. Security policy remains centralized in the control plane. The browser never receives the customer's API key.

The Universal JavaScript player lives in `packages/sdk-js`; framework packages should remain thin wrappers around this contract.
