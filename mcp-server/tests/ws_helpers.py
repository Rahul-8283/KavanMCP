def next_metrics_update(ws) -> dict:
    """
    The next metrics_update on a test WebSocket. Other message types are skipped: when the
    machine running the tests is really over a threshold, alert messages arrive in between.
    """
    while True:
        message = ws.receive_json()
        if message["type"] == "metrics_update":
            return message
