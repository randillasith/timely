"""
Notification checker — runs in background thread.
Checks for upcoming events every 60s and sends Telegram alerts.
"""
import os, time, requests, logging
from datetime import datetime, timezone

BOT_TOKEN = os.environ.get('TELEGRAM_BOT_TOKEN', '')
TELEGRAM_API = f"https://api.telegram.org/bot{BOT_TOKEN}"
DAYS = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday']


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


def fmt(event):
    d = DAYS[event.day] if 0 <= event.day < 7 else '?'
    em = {'task': '📚', 'class': '🏫', 'movie': '🎬', 'nap': '😴', 'oop': '📺', 'db': '🗄️', 'travel': '🚶'}.get(event.category, '📌')
    t = f"⏰ <b>Reminder!</b>\n\n{em} <b>{event.title}</b>\n📅 {d}\n🕐 {event.start_time} – {event.end_time}"
    if event.note: t += f"\n📝 {event.note}"
    return t


def check_and_notify(app):
    with app.app_context():
        from app import User, Event, db
        while True:
            try:
                now = datetime.now(timezone.utc)
                cd = now.weekday()
                for u in User.query.filter(User.telegram_notify == True).all():
                    for e in Event.query.filter(
                        Event.user_id == u.id, Event.notified == False,
                        Event.notify_before.isnot(None), Event.day == cd,
                    ).all():
                        h, m = map(int, e.start_time.split(':'))
                        start_min = h * 60 + m
                        now_min = now.hour * 60 + now.minute
                        diff = start_min - now_min
                        if 0 <= diff <= e.notify_before + 2:
                            send_telegram(u.telegram_chat_id, fmt(e))
                            e.notified = True
                            db.session.commit()

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
