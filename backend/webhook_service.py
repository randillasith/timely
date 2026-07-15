"""
Webhook Dispatch Service
Handles HMAC signing, delivery, retry, and logging for all webhook events.
"""
import hashlib
import hmac
import json
import logging
import time
import requests
from datetime import datetime, timezone
from threading import Thread

logger = logging.getLogger(__name__)

WEBHOOK_EVENTS = [
    'task.created', 'task.updated', 'task.completed', 'task.deleted',
    'event.created', 'event.updated', 'event.deleted',
    'reminder.triggered',
    'timer.started', 'timer.stopped',
]

MAX_RETRIES = 3
RETRY_BACKOFF = [2, 5, 15]  # seconds
REQUEST_TIMEOUT = 10  # seconds


def _sign_payload(payload, secret):
    """Generate HMAC-SHA256 signature for webhook payload."""
    body = json.dumps(payload, separators=(',', ':'), sort_keys=True)
    signature = hmac.new(
        secret.encode('utf-8'),
        body.encode('utf-8'),
        hashlib.sha256
    ).hexdigest()
    return signature


def _send_webhook(webhook, event_type, payload, log_entry):
    """Send a signed webhook POST request with retries."""
    headers = {
        'Content-Type': 'application/json',
        'X-Timely-Signature': _sign_payload(payload, webhook.secret_key),
        'X-Timely-Event': event_type,
        'User-Agent': 'Timely-Webhook/1.0',
    }

    body = json.dumps(payload, separators=(',', ':'), sort_keys=True)

    last_error = None
    for attempt in range(MAX_RETRIES):
        start = time.time()
        try:
            resp = requests.post(
                webhook.target_url,
                data=body,
                headers=headers,
                timeout=REQUEST_TIMEOUT,
            )
            elapsed_ms = int((time.time() - start) * 1000)
            log_entry.response_status = resp.status_code
            log_entry.response_time_ms = elapsed_ms
            log_entry.success = 200 <= resp.status_code < 300
            if log_entry.success:
                return True
            last_error = f"HTTP {resp.status_code}"
        except requests.exceptions.Timeout:
            elapsed_ms = int((time.time() - start) * 1000)
            log_entry.response_time_ms = elapsed_ms
            last_error = "Request timeout"
        except requests.exceptions.ConnectionError as e:
            elapsed_ms = int((time.time() - start) * 1000)
            log_entry.response_time_ms = elapsed_ms
            last_error = f"Connection error: {e}"
        except Exception as e:
            elapsed_ms = int((time.time() - start) * 1000)
            log_entry.response_time_ms = elapsed_ms
            last_error = str(e)

        if attempt < MAX_RETRIES - 1:
            time.sleep(RETRY_BACKOFF[attempt])

    log_entry.success = False
    log_entry.error_message = last_error
    return False


def dispatch_webhooks(event_type, data, user, app):
    """Find all active webhooks for user subscribed to event and dispatch."""
    if not app:
        logger.error("No app context for webhook dispatch")
        return

    with app.app_context():
        from app import Webhook, WebhookLog, db

        webhooks = Webhook.query.filter_by(
            user_id=user.id, active=True
        ).all()

        for wh in webhooks:
            events = json.loads(wh.subscribed_events) if isinstance(wh.subscribed_events, str) else wh.subscribed_events
            if event_type not in events:
                continue

            payload = {
                'event': event_type,
                'timestamp': datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ'),
                'user': {
                    'id': user.id,
                    'name': user.username,
                },
                'data': data,
            }

            log_entry = WebhookLog(
                webhook_id=wh.id,
                event_type=event_type,
                payload=json.dumps(payload, default=str),
            )
            db.session.add(log_entry)
            db.session.commit()

            # Send in foreground for sync, but it's fast enough
            _send_webhook(wh, event_type, payload, log_entry)

            log_entry.completed_at = datetime.now(timezone.utc)
            db.session.commit()


def dispatch_webhooks_async(event_type, data, user, app):
    """Dispatch webhooks in a background thread (fire-and-forget)."""
    t = Thread(
        target=dispatch_webhooks,
        args=(event_type, data, user, app),
        daemon=True,
    )
    t.start()
