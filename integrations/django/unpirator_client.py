import json
from urllib.request import Request, urlopen

class UnpiratorClient:
    def __init__(self, api_url: str, api_key: str):
        self.api_url = api_url.rstrip("/")
        self.api_key = api_key
    def create_playback_session(self, payload: dict) -> dict:
        req = Request(self.api_url + "/v1/playback/sessions", data=json.dumps(payload).encode(), headers={"Authorization": "Bearer " + self.api_key, "Content-Type": "application/json"}, method="POST")
        with urlopen(req, timeout=10) as response:
            return json.load(response)
