"""Mission Control telemetry hook for Hermes Agent.

Sends agent registration, status updates, and session events to
Mission Control's REST API. Fails silently if MC is unreachable.
"""

import os
import sys
import json


def main():
    mc_url = os.environ.get("MC_URL", "")
    mc_api_key = os.environ.get("MC_API_KEY", "")

    if not mc_url or not mc_api_key:
        return

    event = sys.argv[1] if len(sys.argv) > 1 else ""
    try:
        data = json.load(sys.stdin) if not sys.stdin.isatty() else {}
    except (json.JSONDecodeError, EOFError):
        data = {}

    try:
        import httpx
    except ImportError:
        return

    headers = {"x-api-key": mc_api_key, "Content-Type": "application/json"}
    timeout = 3.0

    try:
        with httpx.Client(timeout=timeout) as client:
            if event == "agent:start":
                client.post(
                    f"{mc_url}/api/agents/register",
                    json={
                        "name": "hermes-grader",
                        "role": "agent",
                        "capabilities": ["grading", "vision", "web-search"],
                        "framework": "generic",
                    },
                    headers=headers,
                )
            elif event == "agent:end":
                resp = client.get(
                    f"{mc_url}/api/agents",
                    headers=headers,
                )
                if resp.status_code == 200:
                    agents = resp.json()
                    for agent in agents if isinstance(agents, list) else []:
                        if agent.get("name") == "hermes-grader":
                            agent_id = agent.get("id")
                            if agent_id:
                                client.patch(
                                    f"{mc_url}/api/agents/{agent_id}",
                                    json={"status": "idle"},
                                    headers=headers,
                                )
                            break
            elif event == "session:start":
                session_id = data.get("session_id", "")
                model = data.get("model", "")
                if session_id:
                    client.post(
                        f"{mc_url}/api/hermes/events",
                        json={
                            "event": "session:start",
                            "session_id": session_id,
                            "model": model,
                            "source": data.get("source", "api"),
                        },
                        headers=headers,
                    )
    except Exception:
        pass


if __name__ == "__main__":
    main()
