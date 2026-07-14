"""
Notification checker — runs in background thread.
Checks for upcoming events every 60s and sends Telegram + Expo Push alerts.
"""
import os, time, requests, logging, json
from datetime import datetime, timezone

BOT_TOKEN = os.environ.get('TELEGRAM_BOT_TOKEN', '')
TELEGRAM_API = f"https://api.telegram.org/bot{BOT_TOKEN}"
EXPO_PUSH_API = "https://exp.host/--/api/v2/push/send"
DAYS = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday']

EMOJI = {
    'lecture': '📚', 'lab': '🔬', 'tutorial': '📝',
    'task': '📖', 'class': '🏫', 'movie': '🎬', 'nap': '😴',
    'oop_videos': '📺', 'database': '🗄️', 'travel': '🚶',
    'other': '📌',
}

def send_telegram(chat_id, text):
    if not chat_id: return False
    try:
        r = requests.post(f"{TELEGRAM_API}/sendMessage", json={
            'chat_id': chat_id, 'text': text, 'parse_mode': 'HTML'
        }, timeout=10)
        return r.ok
    except Exception as e:
        logging.error(f"[Notifier] Telegram error: {e}")
        return False

def send_expo_push(push_token, title, body):
    if not push_token: return False
    try:
        r = requests.post(EXPO_PUSH_API, json={
            'to': push_token,
            'title': title,
            'body': body,
            'sound': 'default',
            'priority': 'high',
            'channelId': 'default',
        }, timeout=10)
        return r.ok
    except Exception as e:
        logging.error(f"[Notifier] Expo push error: {e}")
        return False

def fmt_text(event):
    d = DAYS[event.day] if 0 <= event.day < 7 else '?'
    em = EMOJI.get(event.category, '📌')
    t = f"⏰ Reminder!\n\n{em} {event.title}\n{d} · {event.start_time} – {event.end_time}"
    if event.note: t += f"\n{event.note}"
    return t

def fmt_push(event):
    """Short push notification format."""
    d = DAYS[event.day] if 0 <= event.day < 7 else '?'
    em = EMOJI.get(event.category, '📌')
    return f"{em} {event.title} — {d} {event.start_time}–{event.end_time}"

def check_and_notify(app):
    with app.app_context():
        from app import User, Event, db
        while True:
            try:
                now = datetime.now(timezone.utc)
                cd = now.weekday()
                # Convert to 0=Monday format (Python weekday is 0=Monday)
                for u in User.query.filter(
                    (User.telegram_notify == True) | (User.push_token != '')
                ).all():
                    for e in Event.query.filter(
                        Event.user_id == u.id, Event.notified == False,
                        Event.notify_before.isnot(None), Event.day == cd,
                    ).all():
                        h, m = map(int, e.start_time.split(':'))
                        start_min = h * 60 + m
                        now_min = now.hour * 60 + now.minute
                        diff = start_min - now_min
                        if 0 <= diff <= e.notify_before + 2:
                            # Send Telegram
                            send_telegram(u.telegram_chat_id, fmt_text(e))
                            # Send Expo Push
                            send_expo_push(
                                u.push_token,
                                f"⏰ {e.title}",
                                fmt_push(e),
                            )
                            e.notified = True
                            db.session.commit()

                # Reset weekly events for next occurrence
                for e in Event.query.filter(
                    Event.day == cd, Event.notified == True, Event.repeat == 'weekly',
                ).all():
                    h, m = map(int, e.start_time.split(':'))
                    if now.hour * 60 + now.minute > h * 60 + m + 10:
                        e.notified = False
                db.session.commit()
            except Exception as ex:
                logging.error(f"[Notifier] {ex}")
            time.sleep(60)
