"""
Notification checker — runs in background thread.
Checks for upcoming events every 60s and sends alerts via email / Telegram.
"""
import os, smtplib, time, requests
from datetime import datetime
from email.mime.text import MIMEText

# Telegram bot (from env var or hardcoded for this deployment)
BOT_TOKEN = os.environ.get('TELEGRAM_BOT_TOKEN', 'REDACTED')
TELEGRAM_API = f"https://api.telegram.org/bot{BOT_TOKEN}"
FROM_EMAIL = "admin@randillasith.me"
DAYS = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday']


def send_email(to_addr, subject, body):
    try:
        msg = MIMEText(body, 'plain', 'utf-8')
        msg['Subject'] = subject
        msg['From'] = FROM_EMAIL
        msg['To'] = to_addr
        with smtplib.SMTP('localhost', 25, timeout=10) as s:
            s.sendmail(FROM_EMAIL, [to_addr], msg.as_string())
        return True
    except Exception as e:
        print(f"[Notifier] Email error: {e}")
        return False


def send_telegram(chat_id, text):
    if not chat_id:
        return False
    try:
        r = requests.post(f"{TELEGRAM_API}/sendMessage", json={
            'chat_id': chat_id, 'text': text, 'parse_mode': 'HTML'
        }, timeout=10)
        return r.ok
    except Exception as e:
        print(f"[Notifier] Telegram error: {e}")
        return False


def fmt(event, user):
    d = DAYS[event.day] if 0 <= event.day < 7 else '?'
    em = {'task':'📚','class':'🏫','movie':'🎬','nap':'😴','oop':'📺','db':'🗄️','travel':'🚶'}.get(event.category, '📌')
    t = f"⏰ <b>Reminder!</b>\n\n{em} <b>{event.title}</b>\n📅 {d}\n🕐 {event.start_time} – {event.end_time}"
    if event.note: t += f"\n📝 {event.note}"
    return t


def check_and_notify(app):
    """Background loop inside Flask app process."""
    with app.app_context():
        from app import User, Event, db
        while True:
            try:
                now = datetime.utcnow()
                cd = now.weekday()
                users = User.query.filter(
                    (User.email_notify == True) | (User.telegram_notify == True)
                ).all()
                for u in users:
                    for e in Event.query.filter(
                        Event.user_id == u.id, Event.notified == False,
                        Event.notify_before.isnot(None), Event.day == cd,
                    ).all():
                        h, m = map(int, e.start_time.split(':'))
                        start_min = h * 60 + m
                        now_min = now.hour * 60 + now.minute
                        diff = start_min - now_min
                        if 0 <= diff <= e.notify_before + 2:
                            text = fmt(e, u)
                            plain = text.replace('<b>','').replace('</b>','')
                            if u.email_notify and u.email:
                                send_email(u.email, f"⏰ Reminder: {e.title}", plain)
                            if u.telegram_notify and u.telegram_chat_id:
                                send_telegram(u.telegram_chat_id, text)
                            e.notified = True
                            db.session.commit()

                # Reset weekly events after they pass
                for e in Event.query.filter(
                    Event.day == cd, Event.notified == True, Event.repeat == 'weekly',
                ).all():
                    h, m = map(int, e.start_time.split(':'))
                    if now.hour * 60 + now.minute > h * 60 + m + 10:
                        e.notified = False
                db.session.commit()
            except Exception as ex:
                print(f"[Notifier] {ex}")
            time.sleep(60)
