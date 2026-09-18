import json
from urllib.request import Request, urlopen

class UnpiratorClient:
    def __init__(self, api_url: str, api_key: str):
        self.api_url = api_url.rstrip("/")
        self.api_key = api_key

    def create_playback_session(self, payload: dict) -> dict:
        email = str(payload.get("email", "")).strip().lower()
        device_id = str(payload.get("deviceId", "")).strip()
        if "@" not in email:
            raise ValueError("Authenticated viewer email is required")
        if len(device_id) < 8:
            raise ValueError("Stable deviceId is required")
        body = dict(payload)
        body["email"] = email
        body["deviceId"] = device_id
        req = Request(
            self.api_url + "/v1/playback/sessions",
            data=json.dumps(body).encode(),
            headers={
                "Authorization": "Bearer " + self.api_key,
                "Content-Type": "application/json",
            },
            method="POST",
        )
        with urlopen(req, timeout=10) as response:
            return json.load(response)
