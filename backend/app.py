import os, uuid, html, sqlite3, threading, requests, time, re, logging, secrets, json, hmac
from datetime import datetime, timedelta, timezone
from flask import Flask, request, session, jsonify, Response
from flask_sqlalchemy import SQLAlchemy
from flask_cors import CORS
from flask_limiter import Limiter
from flask_limiter.util import get_remote_address
from werkzeug.security import generate_password_hash, check_password_hash
from webhook_service import dispatch_webhooks_async, WEBHOOK_EVENTS

app = Flask(__name__, static_folder='../frontend/dist', static_url_path='/')
app.secret_key = os.environ.get('SECRET_KEY') or secrets.token_hex(32)
if 'SECRET_KEY' not in os.environ:
    logging.warning("SECRET_KEY not set! Using random key — sessions will reset on restart.")
app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///' + os.path.join(
    os.path.dirname(os.path.abspath(__file__)), 'instance', 'timetable.db'
)
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
app.config['SESSION_COOKIE_HTTPONLY'] = True
app.config['SESSION_COOKIE_SAMESITE'] = 'Lax'
app.config['SESSION_COOKIE_SECURE'] = os.environ.get('FLASK_ENV') == 'production'
app.config['MAX_CONTENT_LENGTH'] = 2 * 1024 * 1024  # 2MB max request body

ALLOWED_ORIGINS = os.environ.get('CORS_ORIGINS', 'https://timely.randillasith.me,https://timetable.randillasith.me,http://localhost:5173').split(',')
CORS(app, origins=ALLOWED_ORIGINS, supports_credentials=True)

db = SQLAlchemy(app)
limiter = Limiter(get_remote_address, app=app, default_limits=["200 per day", "50 per hour"],
                  storage_uri="memory://")
INSTANCE_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'instance')
os.makedirs(INSTANCE_DIR, exist_ok=True)

BOT_TOKEN = os.environ.get('TELEGRAM_BOT_TOKEN', '')
TELEGRAM_API = f"https://api.telegram.org/bot{BOT_TOKEN}"

# Persistent webhook secret — deferred to init so AppSettings model exists
WEBHOOK_SECRET = os.environ.get('TELEGRAM_WEBHOOK_SECRET', '')

# ─── Models ───
class User(db.Model):
    __tablename__ = 'users'
    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(80), unique=True, nullable=False)
    password_hash = db.Column(db.String(200), nullable=False)
    theme = db.Column(db.String(20), default='light')
    email = db.Column(db.String(120), default='')
    telegram_notify = db.Column(db.Boolean, default=False)
    telegram_chat_id = db.Column(db.String(50), default='')
    ical_token = db.Column(db.String(36), default=lambda: str(uuid.uuid4()))
    share_token = db.Column(db.String(36), default=lambda: str(uuid.uuid4()))
    created_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))
    is_admin = db.Column(db.Boolean, default=False)
    timezone = db.Column(db.String(50), default='UTC')
    push_token = db.Column(db.String(100), default='')
    api_token = db.Column(db.String(64), default='')

class BotState(db.Model):
    __tablename__ = 'bot_state'
    chat_id = db.Column(db.String(50), primary_key=True)
    welcome_message_id = db.Column(db.Integer, default=None)

class AppSettings(db.Model):
    __tablename__ = 'app_settings'
    key = db.Column(db.String(50), primary_key=True)
    value = db.Column(db.Text, default='')

class GlobalPreset(db.Model):
    __tablename__ = 'global_presets'
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(50), nullable=False)
    color = db.Column(db.String(7), nullable=False, default='#c4956a')
    icon = db.Column(db.String(10), nullable=False, default='📌')
    sort_order = db.Column(db.Integer, default=0)

class Announcement(db.Model):
    __tablename__ = 'announcements'
    id = db.Column(db.Integer, primary_key=True)
    message = db.Column(db.Text, nullable=False)
    type = db.Column(db.String(20), default='banner')  # banner | telegram
    active = db.Column(db.Boolean, default=True)
    created_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))
    sent_at = db.Column(db.DateTime, default=None)

class Category(db.Model):
    __tablename__ = 'categories'
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    name = db.Column(db.String(50), nullable=False)
    color = db.Column(db.String(7), nullable=False, default='#c4956a')
    icon = db.Column(db.String(10), nullable=False, default='📌')

class Event(db.Model):
    __tablename__ = 'events'
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    day = db.Column(db.Integer, nullable=False)
    title = db.Column(db.String(200), nullable=False)
    start_time = db.Column(db.String(5), nullable=False)
    end_time = db.Column(db.String(5), nullable=False)
    category = db.Column(db.String(50), default='task')
    color = db.Column(db.String(7), default=None)
    note = db.Column(db.Text, default='')
    repeat = db.Column(db.String(10), default='none')
    notify_before = db.Column(db.Integer, default=None)
    notified = db.Column(db.Boolean, default=False)
    semester = db.Column(db.String(50), default='')
    location = db.Column(db.String(100), default='')
    skip_dates = db.Column(db.Text, default='[]')  # JSON array of "YYYY-MM-DD"

class Webhook(db.Model):
    __tablename__ = 'webhooks'
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    name = db.Column(db.String(100), nullable=False, default='My Webhook')
    target_url = db.Column(db.String(500), nullable=False)
    subscribed_events = db.Column(db.Text, nullable=False, default='[]')  # JSON array
    secret_key = db.Column(db.String(64), nullable=False)
    active = db.Column(db.Boolean, default=True)
    created_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

class WebhookLog(db.Model):
    __tablename__ = 'webhook_logs'
    id = db.Column(db.Integer, primary_key=True)
    webhook_id = db.Column(db.Integer, db.ForeignKey('webhooks.id'), nullable=False)
    event_type = db.Column(db.String(50), nullable=False)
    payload = db.Column(db.Text, default='')
    response_status = db.Column(db.Integer, default=None)
    response_time_ms = db.Column(db.Integer, default=None)
    success = db.Column(db.Boolean, default=False)
    error_message = db.Column(db.Text, default='')
    created_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))
    completed_at = db.Column(db.DateTime, default=None)

# ─── Safe Migration ───
def migrate_db():
    """Add missing columns without losing data. Backs up DB first."""
    db_path = os.path.join(INSTANCE_DIR, 'timetable.db')
    if not os.path.exists(db_path):
        db.create_all()
        return

    # Backup
    backup_path = db_path + '.backup'
    try:
        import shutil
        shutil.copy2(db_path, backup_path)
        print(f"[Migration] Backed up to {backup_path}")
    except Exception as e:
        print(f"[Migration] Backup failed: {e}")

    db.create_all()

    # Get existing columns per table
    conn = sqlite3.connect(db_path)
    cur = conn.cursor()

    model_columns = {
        'users': [
            ('email', 'VARCHAR(120)', "''"),
            ('theme', 'VARCHAR(20)', 'light'),
            ('telegram_notify', 'BOOLEAN', '0'),
            ('telegram_chat_id', 'VARCHAR(50)', "''"),
            ('ical_token', 'VARCHAR(36)', "''"),
            ('share_token', 'VARCHAR(36)', "''"),
            ('created_at', 'DATETIME', None),
            ('is_admin', 'BOOLEAN', '0'),
            ('timezone', 'VARCHAR(50)', "'UTC'"),
            ('push_token', 'VARCHAR(100)', "''"),
        ],
        'events': [
            ('category', 'VARCHAR(50)', "'task'"),
            ('color', 'VARCHAR(7)', 'NULL'),
            ('note', 'TEXT', "''"),
            ('repeat', 'VARCHAR(10)', "'none'"),
            ('notify_before', 'INTEGER', 'NULL'),
            ('notified', 'BOOLEAN', '0'),
            ('semester', 'VARCHAR(50)', "''"),
            ('location', 'VARCHAR(100)', "''"),
            ('skip_dates', 'TEXT', "'[]'"),
        ],
        'categories': [
            ('color', 'VARCHAR(7)', "'#c4956a'"),
            ('icon', 'VARCHAR(10)', "'📌'"),
        ],
    }

    # Whitelist-safe table/column names — all from hardcoded dict above
    allowed_tables = set(model_columns.keys())
    allowed_col_types = {'VARCHAR', 'TEXT', 'INTEGER', 'BOOLEAN', 'DATETIME'}

    for table, cols in model_columns.items():
        if table not in allowed_tables:
            continue  # safety: skip untrusted table names
        try:
            cur.execute(f"PRAGMA table_info({table})")
        except Exception:
            continue
        existing = {row[1] for row in cur.fetchall()}
        for col_name, col_type, default in cols:
            if col_name not in existing and col_name.isidentifier():
                base_type = col_type.split('(')[0]
                if base_type not in allowed_col_types:
                    continue
                try:
                    sql = f"ALTER TABLE {table} ADD COLUMN {col_name} {col_type}"
                    if default is not None:
                        sql += f" DEFAULT {default}"
                    cur.execute(sql)
                    print(f"[Migration] Added {table}.{col_name}")
                except Exception as e:
                    print(f"[Migration] Could not add {table}.{col_name}: {e}")

    conn.commit()
    conn.close()
    print("[Migration] Complete")

# ─── Telegram Bot Helpers ───
def telegram_send(chat_id, text, reply_markup=None):
    if not chat_id or not BOT_TOKEN: return None
    try:
        payload = {'chat_id': chat_id, 'text': text, 'parse_mode': 'HTML'}
        if reply_markup:
            payload['reply_markup'] = reply_markup
        r = requests.post(f"{TELEGRAM_API}/sendMessage", json=payload, timeout=10)
        data = r.json()
        if r.ok and data.get('ok') and data.get('result'):
            return data['result']
        return None
    except Exception as e:
        print(f"[Bot] send error: {e}")
        return None

def telegram_edit(chat_id, message_id, text):
    if not chat_id or not message_id or not BOT_TOKEN: return False
    try:
        r = requests.post(f"{TELEGRAM_API}/editMessageText", json={
            'chat_id': chat_id, 'message_id': message_id,
            'text': text, 'parse_mode': 'HTML'
        }, timeout=10)
        return r.ok
    except Exception as e:
        print(f"[Bot] edit error: {e}")
        return False

def telegram_delete(chat_id, message_id):
    if not chat_id or not message_id or not BOT_TOKEN: return False
    try:
        r = requests.post(f"{TELEGRAM_API}/deleteMessage", json={
            'chat_id': chat_id, 'message_id': message_id
        }, timeout=10)
        return r.ok
    except Exception as e:
        print(f"[Bot] delete error: {e}")
        return False

# ─── Helpers ───
def login_required():
    # Check Flask session first (for web)
    if 'user_id' in session:
        return db.session.get(User, session['user_id'])
    # Check Authorization header (for mobile app)
    auth = request.headers.get('Authorization', '')
    if auth.startswith('Bearer '):
        token = auth[7:]
        return User.query.filter_by(api_token=token).first()
    return None

def day_name(d):
    return ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'][d]

# ─── Auth ───
@app.route('/')
def index():
    return app.send_static_file('index.html')

SPA_DIST = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'frontend', 'dist')

@app.before_request
def spa_fallback():
    """Serve index.html for any non-API, non-file path (fixes white screen on refresh)."""
    if request.method != 'GET':
        return None
    path = request.path.lstrip('/')
    # Don't intercept API routes or share routes
    if path.startswith('api/') or path.startswith('share/'):
        return None
    # If it's a real file (JS, CSS, etc.), let Flask handle it normally
    filepath = os.path.join(SPA_DIST, path)
    if os.path.isfile(filepath):
        return None
    # Everything else → serve index.html (SPA routing)
    response = app.send_static_file('index.html')
    response.headers['Cache-Control'] = 'no-store, must-revalidate'
    return response

@app.after_request
def security_headers(response):
    response.headers['X-Content-Type-Options'] = 'nosniff'
    response.headers['X-Frame-Options'] = 'DENY'
    response.headers['X-XSS-Protection'] = '1; mode=block'
    response.headers['Referrer-Policy'] = 'strict-origin-when-cross-origin'
    response.headers['Content-Security-Policy'] = "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self'; connect-src 'self'; frame-ancestors 'none'; form-action 'self'"
    return response

# ─── Validation Helpers ───
TIME_RE = re.compile(r'^([01]\d|2[0-3]):[0-5]\d$')

def validate_event_data(data, require_all=False):
    """Validate event fields. Returns error string or None."""
    if require_all:
        if not data.get('title', '').strip():
            return 'Title is required'
        if data.get('day') is None:
            return 'Day is required'
    if 'day' in data:
        try:
            day = int(data['day'])
            if day < 0 or day > 6:
                return 'Day must be 0-6 (Mon-Sun)'
        except (ValueError, TypeError):
            return 'Invalid day value'
    if 'start' in data and not TIME_RE.match(data['start']):
        return 'Invalid start time format (use HH:MM)'
    if 'end' in data and not TIME_RE.match(data['end']):
        return 'Invalid end time format (use HH:MM)'
    if 'repeat' in data and data['repeat'] not in ('none', 'weekly'):
        return 'Invalid repeat value'
    if 'color' in data and data['color']:
        if not re.match(r'^#[0-9a-fA-F]{6}$', data['color']):
            return 'Invalid color format (use #RRGGBB)'
    return None

@app.route('/api/register', methods=['POST'])
@limiter.limit("5 per minute")
def register():
    data = request.get_json()
    if not data: return jsonify({'error': 'Invalid request'}), 400
    username = data.get('username', '').strip()
    password = data.get('password', '')
    email = data.get('email', '').strip()
    if not username or len(username) < 3: return jsonify({'error': 'Username needs 3+ chars'}), 400
    if len(username) > 80: return jsonify({'error': 'Username too long'}), 400
    if not re.match(r'^[a-zA-Z0-9_.\\-]+$', username):
        return jsonify({'error': 'Username can only contain letters, numbers, dots, dashes, underscores'}), 400
    if not password or len(password) < 8: return jsonify({'error': 'Password needs 8+ chars'}), 400
    if User.query.filter_by(username=username).first():
        return jsonify({'error': 'Username taken'}), 409
    user = User(username=username, password_hash=generate_password_hash(password), email=email)
    db.session.add(user)
    db.session.commit()
    if email:
        threading.Thread(target=send_welcome_email, args=(email, username), daemon=True).start()
    session['user_id'] = user.id
    session['username'] = user.username
    return jsonify({'message': 'Registered', 'username': user.username}), 201

@app.route('/api/login', methods=['POST'])
@limiter.limit("10 per minute")
def login():
    data = request.get_json()
    if not data: return jsonify({'error': 'Invalid request'}), 400
    username = data.get('username', '').strip()
    password = data.get('password', '')
    user = User.query.filter_by(username=username).first()
    if not user or not check_password_hash(user.password_hash, password):
        return jsonify({'error': 'Invalid credentials'}), 401
    session['user_id'] = user.id
    session['username'] = user.username
    # Generate API token for mobile app
    user.api_token = secrets.token_hex(32)
    db.session.commit()
    return jsonify({
        'message': 'Logged in', 'username': user.username,
        'theme': user.theme, 'session': user.api_token
    })

@app.route('/api/logout', methods=['POST'])
def logout():
    session.clear()
    return jsonify({'message': 'Logged out'})

@app.route('/api/me')
def api_me():
    user = login_required()
    if not user: return jsonify({'error': 'Not logged in'}), 401
    return jsonify({
        'username': user.username, 'theme': user.theme,
        'email': user.email,
        'telegram_notify': user.telegram_notify, 'telegram_chat_id': user.telegram_chat_id,
        'share_token': user.share_token, 'ical_token': user.ical_token,
        'is_admin': user.is_admin or False,
        'timezone': user.timezone,
    })

# ─── Theme ───
@app.route('/api/theme', methods=['PUT'])
def update_theme():
    user = login_required()
    if not user: return jsonify({'error': 'Not logged in'}), 401
    data = request.get_json()
    theme = data.get('theme', 'light')
    if theme not in ('light', 'dark', 'pink', 'blue', 'purple', 'green'):
        return jsonify({'error': 'Invalid theme'}), 400
    user.theme = theme
    db.session.commit()
    return jsonify({'theme': theme})

# ─── Telegram Bot Webhook ───
@app.route('/api/bot-webhook', methods=['POST'])
def bot_webhook():
    """Receives updates from Telegram bot."""
    # Verify the request is from Telegram
    token = request.headers.get('X-Telegram-Bot-Api-Secret-Token', '')
    if not hmac.compare_digest(token, WEBHOOK_SECRET):
        return 'Unauthorized', 403
    update = request.get_json(force=True, silent=True)
    if not update: return 'ok', 200

    msg = update.get('message', {})
    chat = msg.get('chat', {})
    chat_id = str(chat.get('id', ''))
    text = msg.get('text', '').strip()

    if not chat_id or not text:
        return 'ok', 200

    if text == '/start':
        welcome = (
            f"👋 <b>Welcome to Timely Bot!</b>\n\n"
            f"Your Telegram Chat ID is:\n"
            f"<code>{chat_id}</code>\n\n"
            f"📌 <b>How to connect:</b>\n"
            f"1️⃣ Copy the Chat ID above\n"
            f"2️⃣ Go to your <a href=\"https://timely.randillasith.me\">Timely App</a>\n"
            f"3️⃣ Open ⚙️ Settings → 🔔 Notify\n"
            f"4️⃣ Paste your Chat ID and enable notifications\n\n"
            f"✅ Once connected, this message will change to confirm!"
        )
        result = telegram_send(chat_id, welcome)
        if result:
            msg_id = result.get('message_id')
            state = BotState.query.get(chat_id)
            if state:
                state.welcome_message_id = msg_id
            else:
                db.session.add(BotState(chat_id=chat_id, welcome_message_id=msg_id))
            db.session.commit()
    elif text == '/chatid':
        telegram_send(chat_id, f"Your Chat ID: <code>{chat_id}</code>")
    elif text == '/today':
        user = User.query.filter_by(telegram_chat_id=chat_id).first()
        if not user:
            telegram_send(chat_id, "❌ Your chat ID isn't connected to any account yet.\n\nGo to ⚙️ Settings → 🔔 Notify in the Timely app and save your Chat ID first!")
        else:
            today = datetime.now(timezone.utc).weekday()  # Mon=0
            events = Event.query.filter_by(user_id=user.id, day=today).order_by(Event.start_time).all()
            days = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday']
            if not events:
                telegram_send(chat_id, f"📅 <b>{days[today]} — No events</b>\n\nYou have nothing scheduled today. Enjoy your free day! 😊")
            else:
                msg = f"📅 <b>{days[today]} — Your Schedule</b>\n\n"
                for e in events:
                    emoji = '📌'
                    if 'nap' in e.title.lower() or e.category == 'Nap': emoji = '😴'
                    elif 'movie' in e.title.lower() or e.category == 'Movie': emoji = '🎬'
                    elif 'oop' in e.title.lower() or e.category == 'OOP': emoji = '📺'
                    elif 'database' in e.title.lower() or e.category == 'Database': emoji = '🗄️'
                    elif 'lecture' in e.title.lower() or e.category == 'Lecture': emoji = '🏫'
                    elif 'lab' in e.title.lower() or e.category == 'Lab': emoji = '🔬'
                    elif e.category == 'Study': emoji = '📚'
                    elif e.category == 'Travel': emoji = '🚶'
                    repeat_tag = ' 🔁' if e.repeat == 'weekly' else ''
                    msg += f"{emoji} <b>{e.title}</b>{repeat_tag}\n"
                    msg += f"   ⏰ {e.start_time} – {e.end_time}\n"
                    if e.note:
                        msg += f"   💬 {e.note[:100]}\n"
                    msg += "\n"
                telegram_send(chat_id, msg.strip())
    elif text == '/week':
        user = User.query.filter_by(telegram_chat_id=chat_id).first()
        if not user:
            telegram_send(chat_id, "❌ Your chat ID isn't connected to any account yet.\n\nGo to ⚙️ Settings → 🔔 Notify in the Timely app and save your Chat ID first!")
        else:
            events = Event.query.filter_by(user_id=user.id).order_by(Event.day, Event.start_time).all()
            days = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday']
            msg = "📅 <b>Your Weekly Schedule</b>\n\n"
            for di in range(7):
                day_evs = [e for e in events if e.day == di]
                if not day_evs: continue
                msg += f"<b>{days[di]}</b>\n"
                for e in day_evs:
                    repeat_tag = ' 🔁' if e.repeat == 'weekly' else ''
                    msg += f"  ⏰ {e.start_time}–{e.end_time} — {e.title}{repeat_tag}\n"
                msg += "\n"
            telegram_send(chat_id, msg.strip())
    elif text in ('/help', '/commands'):
        telegram_send(chat_id, (
            "🤖 <b>Timely Bot Commands</b>\n\n"
            "/start — Get your Chat ID & connection guide\n"
            "/today — View today's schedule\n"
            "/week — View full weekly schedule\n"
            "/chatid — Show your Chat ID\n"
            "/help — Show this message"
        ))

    return 'ok', 200

# ─── Confirm bot connection (called from settings when user saves chat_id) ───
def _confirm_bot(chat_id):
    """Edit the welcome message to show connected status. Called internally."""
    if not chat_id: return
    state = BotState.query.get(chat_id)
    if state and state.welcome_message_id:
        confirm = (
            f"✅ <b>Connected to Timely!</b>\n\n"
            f"You'll now receive reminders here when events are about to start. 📅\n\n"
            f"🔧 Use /start to see your Chat ID again"
        )
        telegram_edit(chat_id, state.welcome_message_id, confirm)
        telegram_send(chat_id, "🔔 Notifications are now active! ✅")

# ─── SMTP / Welcome Email ───
SMTP_CONFIG = {
    'host': os.environ.get('SMTP_HOST', 'mail.randillasith.me'),
    'port': int(os.environ.get('SMTP_PORT', 587)),
    'user': os.environ.get('SMTP_USER', 'admin@randillasith.me'),
    'pass': os.environ.get('SMTP_PASS', ''),
    'from': os.environ.get('SMTP_FROM', 'admin@randillasith.me'),
    'from_name': os.environ.get('SMTP_FROM_NAME', 'Timely'),
}

def send_welcome_email(to_email, username):
    """Send welcome email via SMTP with HTML template. Runs in background thread."""
    if not to_email or not SMTP_CONFIG['pass']:
        return False
    try:
        import smtplib, email.utils
        from email.mime.text import MIMEText
        app_url = 'https://timely.randillasith.me'
        body = f"""<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>Welcome to Timely</title>
</head>
<body style="margin:0; padding:0; background-color:#f4f6f8; font-family:Arial, Helvetica, sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0">
    <tr>
        <td align="center" style="padding:40px 20px;">
            <table width="600" cellpadding="0" cellspacing="0"
                   style="background:#ffffff; border-radius:12px; overflow:hidden;">
                <!-- Header -->
                <tr>
                    <td align="center"
                        style="background:#2563eb; padding:35px;">
                        <h1 style="color:#ffffff; margin:0; font-size:32px;">
                            Timely
                        </h1>
                        <p style="color:#dbeafe; margin:10px 0 0; font-size:16px;">
                            Smart scheduling and reminders
                        </p>
                    </td>
                </tr>
                <!-- Content -->
                <tr>
                    <td style="padding:40px; color:#333333;">
                        <h2 style="margin-top:0; color:#111827;">
                            Welcome to Timely, {username}
                        </h2>
                        <p style="font-size:16px; line-height:1.6;">
                            Thank you for joining Timely. Your account has been
                            successfully created and your schedule is ready.
                        </p>
                        <p style="font-size:16px; line-height:1.6;">
                            Start adding your events, tasks, and important dates.
                            Timely will help you stay organized by sending
                            reminders directly through Telegram.
                        </p>
                        <!-- Feature Box -->
                        <table width="100%" cellpadding="0" cellspacing="0"
                               style="background:#f1f5f9; border-radius:8px; margin:25px 0;">
                            <tr>
                                <td style="padding:20px;">
                                    <h3 style="margin:0 0 10px; color:#1e40af;">
                                        Get started
                                    </h3>
                                    <p style="margin:0; line-height:1.6;">
                                        • Create your first event<br>
                                        • Set reminders<br>
                                        • Receive notifications through Telegram
                                    </p>
                                </td>
                            </tr>
                        </table>
                        <!-- Button -->
                        <div style="text-align:center; margin:30px 0;">
                            <a href="{app_url}"
                               style="
                               background:#2563eb;
                               color:white;
                               padding:14px 30px;
                               text-decoration:none;
                               border-radius:8px;
                               font-size:16px;
                               display:inline-block;">
                                Open Timely
                            </a>
                        </div>
                        <p style="font-size:15px; line-height:1.6;">
                            If you have any questions or need assistance,
                            feel free to contact our support team.
                        </p>
                        <p style="margin-top:30px;">
                            Best regards,<br>
                            <strong>The Timely Team</strong>
                        </p>
                    </td>
                </tr>
                <!-- Footer -->
                <tr>
                    <td align="center"
                        style="background:#f8fafc; padding:20px; color:#64748b; font-size:13px;">
                        <p style="margin:0;">
                            © 2026 Timely. All rights reserved.
                        </p>
                        <p style="margin:8px 0 0;">
                            Smart scheduling made simple.
                        </p>
                    </td>
                </tr>
            </table>
        </td>
    </tr>
</table>
</body>
</html>"""
        msg = MIMEText(body, 'html')
        msg['Subject'] = f"Welcome to Timely, {username}! 🎉"
        msg['From'] = f"{SMTP_CONFIG['from_name']} <{SMTP_CONFIG['from']}>"
        msg['To'] = to_email
        msg['Date'] = email.utils.formatdate(localtime=True)
        msg['Message-ID'] = email.utils.make_msgid(domain='timely.randillasith.me')

        s = smtplib.SMTP(SMTP_CONFIG['host'], SMTP_CONFIG['port'], timeout=15)
        s.ehlo()
        s.starttls()
        s.ehlo()
        s.login(SMTP_CONFIG['user'], SMTP_CONFIG['pass'])
        s.send_message(msg)
        s.quit()
        print(f"[Email] Welcome sent to {to_email}")
        return True
    except Exception as e:
        print(f"[Email] Failed to send to {to_email}: {e}")
        return False

# ─── Notification Settings (Telegram only) ───
@app.route('/api/notify-settings', methods=['GET'])
def get_notify_settings():
    user = login_required()
    if not user: return jsonify({'error': 'Not logged in'}), 401
    return jsonify({
        'email': user.email,
        'telegram_notify': user.telegram_notify,
        'telegram_chat_id': user.telegram_chat_id,
        'timezone': user.timezone,
    })

@app.route('/api/notify-settings', methods=['PUT'])
def update_notify_settings():
    user = login_required()
    if not user: return jsonify({'error': 'Not logged in'}), 401
    data = request.get_json()
    if not data: return jsonify({'error': 'Invalid request'}), 400
    if 'email' in data:
        email = data['email'].strip()
        if email and not re.match(r'^[^@\s]+@[^@\s]+\.[^@\s]+$', email):
            return jsonify({'error': 'Invalid email format'}), 400
        if len(email) > 120:
            return jsonify({'error': 'Email too long (max 120 chars)'}), 400
        user.email = email
    if 'telegram_notify' in data: user.telegram_notify = bool(data['telegram_notify'])
    if 'telegram_chat_id' in data:
        chat_id = data['telegram_chat_id'].strip()
        if chat_id and not re.match(r'^-?\d{5,15}$', chat_id):
            return jsonify({'error': 'Invalid Telegram Chat ID format'}), 400
        if len(chat_id) > 50:
            return jsonify({'error': 'Chat ID too long'}), 400
        user.telegram_chat_id = chat_id
    if 'timezone' in data:
        tz = data['timezone'].strip()[:50]
        if tz:
            try:
                from zoneinfo import available_timezones
                if tz not in available_timezones():
                    return jsonify({'error': f'Invalid timezone: {tz}'}), 400
            except Exception:
                pass  # fallback: skip validation if zoneinfo unavailable
        user.timezone = tz
    db.session.commit()
    # If chat_id was just set, confirm connection with bot directly
    if user.telegram_chat_id and user.telegram_notify:
        _confirm_bot(user.telegram_chat_id)
    return jsonify({'message': 'Settings updated'})


@app.route('/api/push-token', methods=['PUT'])
def register_push_token():
    user = login_required()
    if not user: return jsonify({'error': 'Not logged in'}), 401
    data = request.get_json()
    if not data or not data.get('expo_push_token'):
        return jsonify({'error': 'Token required'}), 400
    user.push_token = data['expo_push_token'].strip()[:100]
    db.session.commit()
    return jsonify({'message': 'Push token registered'})


@app.route('/api/change-password', methods=['PUT'])
def change_password():
    user = login_required()
    if not user: return jsonify({'error': 'Not logged in'}), 401
    data = request.get_json()
    if not data: return jsonify({'error': 'Invalid request'}), 400
    current = data.get('current_password', '')
    new_pass = data.get('new_password', '')
    if not current or not new_pass:
        return jsonify({'error': 'Both current and new password required'}), 400
    if len(new_pass) < 8:
        return jsonify({'error': 'New password needs 8+ characters'}), 400
    if not check_password_hash(user.password_hash, current):
        return jsonify({'error': 'Current password is incorrect'}), 403
    user.password_hash = generate_password_hash(new_pass)
    db.session.commit()
    return jsonify({'message': 'Password changed successfully'})

# ─── Categories ───
@app.route('/api/categories', methods=['GET'])
def get_categories():
    user = login_required()
    if not user: return jsonify({'error': 'Not logged in'}), 401
    cats = Category.query.filter_by(user_id=user.id).all()
    return jsonify([{'id':c.id,'name':c.name,'color':c.color,'icon':c.icon} for c in cats])

@app.route('/api/categories', methods=['POST'])
@limiter.limit("20 per minute")
def create_category():
    user = login_required()
    if not user: return jsonify({'error': 'Not logged in'}), 401
    data = request.get_json()
    if not data or not data.get('name'): return jsonify({'error': 'Name required'}), 400
    name = data['name'].strip()[:50]
    if not name: return jsonify({'error': 'Name required'}), 400
    color = data.get('color', '#c4956a')
    if color and not re.match(r'^#[0-9a-fA-F]{6}$', color):
        return jsonify({'error': 'Invalid color format (use #RRGGBB)'}), 400
    icon = data.get('icon', '📌')
    if len(icon) > 10:
        return jsonify({'error': 'Icon too long (max 10 chars)'}), 400
    cat = Category(user_id=user.id, name=name, color=color, icon=icon)
    db.session.add(cat); db.session.commit()
    return jsonify({'id': cat.id, 'message': 'Created'}), 201

@app.route('/api/categories/<int:cid>', methods=['PUT'])
@limiter.limit("20 per minute")
def update_category(cid):
    user = login_required()
    if not user: return jsonify({'error': 'Not logged in'}), 401
    cat = Category.query.filter_by(id=cid, user_id=user.id).first()
    if not cat: return jsonify({'error': 'Not found'}), 404
    data = request.get_json()
    if 'name' in data:
        name = data['name'].strip()[:50]
        if not name: return jsonify({'error': 'Name cannot be empty'}), 400
        cat.name = name
    if 'color' in data:
        if data['color'] and not re.match(r'^#[0-9a-fA-F]{6}$', data['color']):
            return jsonify({'error': 'Invalid color format (use #RRGGBB)'}), 400
        cat.color = data['color']
    if 'icon' in data:
        if len(data['icon']) > 10:
            return jsonify({'error': 'Icon too long (max 10 chars)'}), 400
        cat.icon = data['icon']
    db.session.commit()
    return jsonify({'message': 'Updated'})

@app.route('/api/categories/<int:cid>', methods=['DELETE'])
@limiter.limit("20 per minute")
def delete_category(cid):
    user = login_required()
    if not user: return jsonify({'error': 'Not logged in'}), 401
    cat = Category.query.filter_by(id=cid, user_id=user.id).first()
    if not cat: return jsonify({'error': 'Not found'}), 404
    db.session.delete(cat); db.session.commit()
    return jsonify({'message': 'Deleted'})

@app.route('/api/presets')
def get_presets():
    """Return global presets from DB, falling back to defaults if empty."""
    presets = GlobalPreset.query.order_by(GlobalPreset.sort_order).all()
    if presets:
        return jsonify([{'id':p.id,'name':p.name,'color':p.color,'icon':p.icon} for p in presets])
    # Fallback defaults
    return jsonify([
        {'id':0,'name':'Lecture','color':'#e8e0f0','icon':'📚'},
        {'id':0,'name':'Lab','color':'#d8e0f0','icon':'🔬'},
        {'id':0,'name':'Tutorial','color':'#e0d8f0','icon':'📝'},
        {'id':0,'name':'Study','color':'#f5e6d8','icon':'📚'},
        {'id':0,'name':'Class','color':'#e8e0f0','icon':'🏫'},
        {'id':0,'name':'Movie','color':'#f0d8d8','icon':'🎬'},
        {'id':0,'name':'Nap','color':'#d8e8e8','icon':'😴'},
        {'id':0,'name':'OOP Videos','color':'#d8e8d0','icon':'📺'},
        {'id':0,'name':'Database','color':'#d8d0e8','icon':'🗄️'},
        {'id':0,'name':'Travel','color':'#f0ece4','icon':'🚶'},
        {'id':0,'name':'Other','color':'#f5e6d8','icon':'📌'},
    ])

# ─── Events ───
@app.route('/api/locations', methods=['GET'])
def get_locations():
    user = login_required()
    if not user: return jsonify({'error': 'Not logged in'}), 401
    rows = db.session.query(Event.location).filter(
        Event.user_id == user.id,
        Event.location != '',
        Event.location.isnot(None)
    ).distinct().all()
    return jsonify(sorted([r[0] for r in rows]))

@app.route('/api/events', methods=['GET'])
def get_events():
    user = login_required()
    if not user: return jsonify({'error': 'Not logged in'}), 401
    events = Event.query.filter_by(user_id=user.id).all()
    return jsonify([{
        'id':e.id,'day':e.day,'title':e.title,
        'start':e.start_time,'end':e.end_time,
        'start_time':e.start_time,'end_time':e.end_time,
        'category':e.category,'color':e.color,'note':e.note,'repeat':e.repeat,
        'notify_before':e.notify_before, 'semester':e.semester or '',
        'location':e.location or '',
        'skip_dates': json.loads(e.skip_dates) if e.skip_dates else [],
    } for e in events])

@app.route('/api/events', methods=['POST'])
@limiter.limit("30 per minute")
def create_event():
    user = login_required()
    if not user: return jsonify({'error': 'Not logged in'}), 401
    data = request.get_json()
    if not data: return jsonify({'error': 'Invalid request'}), 400
    err = validate_event_data(data, require_all=True)
    if err: return jsonify({'error': err}), 400
    event = Event(
        user_id=user.id, day=int(data['day']),
        title=data['title'].strip()[:200],
        start_time=data.get('start','09:00'),
        end_time=data.get('end','10:00'),
        category=data.get('category','task')[:50],
        color=data.get('color') or None,
        note=data.get('note','')[:2000],
        repeat=data.get('repeat','none'),
        notify_before=data.get('notify_before'),
        semester=data.get('semester','')[:50],
        location=data.get('location','')[:100],
        skip_dates=json.dumps(data.get('skip_dates', [])),
    )
    db.session.add(event)
    db.session.commit()
    event_type = 'event.created'
    if event.category in ('task', 'study') and event.repeat == 'none':
        event_type = 'task.created'
    dispatch_webhooks_async(event_type, {
        'id': event.id, 'title': event.title, 'day': event.day,
        'start': event.start_time, 'end': event.end_time,
        'category': event.category, 'repeat': event.repeat,
        'location': event.location, 'note': event.note,
        'status': 'created',
    }, user, app)
    return jsonify({'id': event.id, 'message': 'Created'}), 201

@app.route('/api/events/<int:eid>', methods=['PUT'])
@limiter.limit("30 per minute")
def update_event(eid):
    user = login_required()
    if not user: return jsonify({'error': 'Not logged in'}), 401
    event = Event.query.filter_by(id=eid, user_id=user.id).first()
    if not event: return jsonify({'error': 'Not found'}), 404
    data = request.get_json()
    if not data: return jsonify({'error': 'Invalid request'}), 400
    err = validate_event_data(data, require_all=False)
    if err: return jsonify({'error': err}), 400
    if 'title' in data: event.title = data['title'].strip()[:200]
    if 'day' in data: event.day = int(data['day'])
    if 'start' in data: event.start_time = data['start']
    if 'end' in data: event.end_time = data['end']
    if 'category' in data: event.category = data['category'][:50]
    if 'color' in data: event.color = data['color'] or None
    if 'note' in data: event.note = data['note'][:2000]
    if 'repeat' in data: event.repeat = data['repeat']
    if 'notify_before' in data: event.notify_before = data.get('notify_before')
    if 'semester' in data: event.semester = data['semester'][:50]
    if 'location' in data: event.location = data['location'][:100]
    if 'skip_dates' in data: event.skip_dates = json.dumps(data['skip_dates'])
    db.session.commit()
    event_type = 'event.updated'
    if event.category in ('task', 'study') and event.repeat == 'none':
        event_type = 'task.updated'
        if data.get('status') == 'completed' or (not data.get('status') and event.repeat == 'none'):
            pass  # keep as updated
    dispatch_webhooks_async(event_type, {
        'id': event.id, 'title': event.title, 'day': event.day,
        'start': event.start_time, 'end': event.end_time,
        'category': event.category, 'repeat': event.repeat,
        'location': event.location, 'note': event.note,
        'status': 'updated',
    }, user, app)
    return jsonify({'message': 'Updated'})

@app.route('/api/events/<int:eid>', methods=['DELETE'])
@limiter.limit("30 per minute")
def delete_event(eid):
    user = login_required()
    if not user: return jsonify({'error': 'Not logged in'}), 401
    event = Event.query.filter_by(id=eid, user_id=user.id).first()
    if not event: return jsonify({'error': 'Not found'}), 404
    ev_data = {'id': event.id, 'title': event.title, 'category': event.category}
    db.session.delete(event); db.session.commit()
    event_type = 'event.deleted'
    if ev_data['category'] in ('task', 'study'):
        event_type = 'task.deleted'
    dispatch_webhooks_async(event_type, ev_data, user, app)
    return jsonify({'message': 'Deleted'})

# ─── Import / Export ───
@app.route('/api/export', methods=['GET'])
def export_json():
    user = login_required()
    if not user: return jsonify({'error': 'Not logged in'}), 401
    events = Event.query.filter_by(user_id=user.id).all()
    cats = Category.query.filter_by(user_id=user.id).all()
    return jsonify({
        'version': 1,
        'exported_at': datetime.now(timezone.utc).isoformat(),
        'events': [{
            'day':e.day,'title':e.title,'start':e.start_time,'end':e.end_time,
            'category':e.category,'color':e.color,'note':e.note,'repeat':e.repeat
        } for e in events],
        'categories': [{'name':c.name,'color':c.color,'icon':c.icon} for c in cats]
    })

@app.route('/api/import', methods=['POST'])
@limiter.limit("10 per minute")
def import_json():
    user = login_required()
    if not user: return jsonify({'error': 'Not logged in'}), 401
    data = request.get_json()
    if not data or 'events' not in data:
        return jsonify({'error': 'Invalid import file'}), 400
    # Build set of existing events for deduplication
    existing = {(e.day, e.title, e.start_time, e.end_time)
                for e in Event.query.filter_by(user_id=user.id).all()}
    existing_cats = {c.name for c in Category.query.filter_by(user_id=user.id).all()}
    count = 0; skipped = 0; errors = []
    for e in data.get('events', []):
        if not e.get('title'): continue
        # Validate each event before importing
        err = validate_event_data({
            'title': e.get('title'),
            'day': e.get('day'),
            'start': e.get('start'),
            'end': e.get('end'),
            'category': e.get('category'),
            'color': e.get('color'),
            'repeat': e.get('repeat'),
        }, require_all=True)
        if err:
            errors.append(f"\"{e.get('title','')}\": {err}")
            skipped += 1
            continue
        key = (int(e['day']), e['title'].strip(), e.get('start', '09:00'), e.get('end', '10:00'))
        if key in existing:
            skipped += 1; continue
        ev = Event(
            user_id=user.id, day=int(e.get('day',0)),
            title=e['title'].strip()[:200],
            start_time=e.get('start','09:00'),
            end_time=e.get('end','10:00'),
            category=e.get('category','task'),
            color=e.get('color') or None,
            note=e.get('note','')[:2000],
            repeat=e.get('repeat','none')
        )
        db.session.add(ev); count += 1; existing.add(key)
    for c in data.get('categories', []):
        if not c.get('name') or c['name'].strip() in existing_cats: continue
        cat = Category(
            user_id=user.id, name=c['name'].strip(),
            color=c.get('color','#c4956a'), icon=c.get('icon','📌')
        )
        db.session.add(cat); existing_cats.add(c['name'].strip())
    db.session.commit()
    msg = f'Imported {count} events'
    if skipped: msg += f' ({skipped} duplicates/skipped)'
    if errors: msg += '. Errors: ' + '; '.join(errors[:5])
    return jsonify({'message': msg})

# ─── Webhook Routes ───
@app.route('/api/webhooks', methods=['GET'])
def list_webhooks():
    """List user's webhooks."""
    user = login_required()
    if not user: return jsonify({'error': 'Not logged in'}), 401
    whs = Webhook.query.filter_by(user_id=user.id).order_by(Webhook.created_at.desc()).all()
    return jsonify([{
        'id': w.id, 'name': w.name, 'target_url': w.target_url,
        'subscribed_events': json.loads(w.subscribed_events) if isinstance(w.subscribed_events, str) else w.subscribed_events,
        'secret_key_masked': w.secret_key[:8] + '...' + w.secret_key[-4:] if w.secret_key else '',
        'secret_key': '',  # not exposed on list — only on creation
        'active': w.active,
        'created_at': w.created_at.isoformat() if w.created_at else None,
        'updated_at': w.updated_at.isoformat() if w.updated_at else None,
    } for w in whs])

@app.route('/api/webhooks', methods=['POST'])
@limiter.limit("10 per minute")
def create_webhook():
    """Create a webhook."""
    user = login_required()
    if not user: return jsonify({'error': 'Not logged in'}), 401
    data = request.get_json()
    if not data: return jsonify({'error': 'Invalid request'}), 400
    target_url = (data.get('target_url') or '').strip()
    if not target_url:
        return jsonify({'error': 'Target URL is required'}), 400
    if not target_url.startswith('https://'):
        return jsonify({'error': 'URL must use HTTPS'}), 400
    name = (data.get('name') or '').strip() or 'My Webhook'
    events = data.get('subscribed_events', [])
    if not events:
        return jsonify({'error': 'At least one event must be selected'}), 400
    invalid = [e for e in events if e not in WEBHOOK_EVENTS]
    if invalid:
        return jsonify({'error': f'Invalid events: {", ".join(invalid)}'}), 400
    wh = Webhook(
        user_id=user.id, name=name,
        target_url=target_url,
        subscribed_events=json.dumps(events),
        secret_key=secrets.token_hex(32),
        active=True,
    )
    db.session.add(wh); db.session.commit()
    return jsonify({
        'id': wh.id, 'name': wh.name, 'target_url': wh.target_url,
        'subscribed_events': events, 'secret_key': wh.secret_key, 'active': wh.active,
        'created_at': wh.created_at.isoformat() if wh.created_at else None,
        'message': 'Webhook created',
    }), 201

@app.route('/api/webhooks/<int:wid>', methods=['GET'])
def get_webhook(wid):
    """Get a single webhook."""
    user = login_required()
    if not user: return jsonify({'error': 'Not logged in'}), 401
    wh = Webhook.query.filter_by(id=wid, user_id=user.id).first()
    if not wh: return jsonify({'error': 'Not found'}), 404
    return jsonify({
        'id': wh.id, 'name': wh.name, 'target_url': wh.target_url,
        'subscribed_events': json.loads(wh.subscribed_events) if isinstance(wh.subscribed_events, str) else wh.subscribed_events,
        'secret_key_masked': wh.secret_key[:8] + '...' + wh.secret_key[-4:] if wh.secret_key else '',
        'secret_key': '',  # not exposed on detail — only on creation
        'active': wh.active,
        'created_at': wh.created_at.isoformat() if wh.created_at else None,
        'updated_at': wh.updated_at.isoformat() if wh.updated_at else None,
    })

@app.route('/api/webhooks/<int:wid>', methods=['PUT'])
@limiter.limit("20 per minute")
def update_webhook(wid):
    """Update a webhook."""
    user = login_required()
    if not user: return jsonify({'error': 'Not logged in'}), 401
    wh = Webhook.query.filter_by(id=wid, user_id=user.id).first()
    if not wh: return jsonify({'error': 'Not found'}), 404
    data = request.get_json()
    if not data: return jsonify({'error': 'Invalid request'}), 400
    if 'name' in data:
        wh.name = data['name'].strip()[:100]
    if 'target_url' in data:
        url = data['target_url'].strip()
        if not url.startswith('https://'):
            return jsonify({'error': 'URL must use HTTPS'}), 400
        wh.target_url = url
    if 'subscribed_events' in data:
        events = data['subscribed_events']
        if not events:
            return jsonify({'error': 'At least one event required'}), 400
        invalid = [e for e in events if e not in WEBHOOK_EVENTS]
        if invalid:
            return jsonify({'error': f'Invalid events: {", ".join(invalid)}'}), 400
        wh.subscribed_events = json.dumps(events)
    if 'active' in data:
        wh.active = bool(data['active'])
    wh.updated_at = datetime.now(timezone.utc)
    db.session.commit()
    return jsonify({'message': 'Webhook updated'})

@app.route('/api/webhooks/<int:wid>', methods=['DELETE'])
@limiter.limit("20 per minute")
def delete_webhook(wid):
    """Delete a webhook and its logs."""
    user = login_required()
    if not user: return jsonify({'error': 'Not logged in'}), 401
    wh = Webhook.query.filter_by(id=wid, user_id=user.id).first()
    if not wh: return jsonify({'error': 'Not found'}), 404
    WebhookLog.query.filter_by(webhook_id=wid).delete()
    db.session.delete(wh); db.session.commit()
    return jsonify({'message': 'Webhook deleted'})

@app.route('/api/webhooks/<int:wid>/toggle', methods=['POST'])
def toggle_webhook(wid):
    """Enable/disable a webhook."""
    user = login_required()
    if not user: return jsonify({'error': 'Not logged in'}), 401
    wh = Webhook.query.filter_by(id=wid, user_id=user.id).first()
    if not wh: return jsonify({'error': 'Not found'}), 404
    wh.active = not wh.active
    wh.updated_at = datetime.now(timezone.utc)
    db.session.commit()
    return jsonify({'active': wh.active, 'message': 'Webhook ' + ('enabled' if wh.active else 'disabled')})

@app.route('/api/webhooks/<int:wid>/test', methods=['POST'])
def test_webhook(wid):
    """Send a test event to the webhook."""
    user = login_required()
    if not user: return jsonify({'error': 'Not logged in'}), 401
    wh = Webhook.query.filter_by(id=wid, user_id=user.id).first()
    if not wh: return jsonify({'error': 'Not found'}), 404
    from webhook_service import dispatch_webhooks
    dispatch_webhooks('task.completed', {
        'id': 0, 'title': 'Test Webhook',
        'status': 'completed', 'note': 'This is a test event from Timely',
    }, user, app)
    return jsonify({'message': 'Test event sent'})

@app.route('/api/webhooks/<int:wid>/logs', methods=['GET'])
def get_webhook_logs(wid):
    """Get delivery logs for a webhook."""
    user = login_required()
    if not user: return jsonify({'error': 'Not logged in'}), 401
    wh = Webhook.query.filter_by(id=wid, user_id=user.id).first()
    if not wh: return jsonify({'error': 'Not found'}), 404
    limit = min(int(request.args.get('limit', 50)), 200)
    logs = WebhookLog.query.filter_by(webhook_id=wid)\
        .order_by(WebhookLog.created_at.desc()).limit(limit).all()
    return jsonify([{
        'id': l.id, 'event_type': l.event_type,
        'response_status': l.response_status,
        'response_time_ms': l.response_time_ms,
        'success': l.success,
        'error_message': l.error_message,
        'created_at': l.created_at.isoformat() if l.created_at else None,
        'completed_at': l.completed_at.isoformat() if l.completed_at else None,
    } for l in logs])

@app.route('/api/webhooks/<int:wid>/logs/<int:log_id>/retry', methods=['POST'])
def retry_webhook(wid, log_id):
    """Retry a failed webhook delivery."""
    user = login_required()
    if not user: return jsonify({'error': 'Not logged in'}), 401
    wh = Webhook.query.filter_by(id=wid, user_id=user.id).first()
    if not wh: return jsonify({'error': 'Webhook not found'}), 404
    log_entry = WebhookLog.query.filter_by(id=log_id, webhook_id=wid).first()
    if not log_entry: return jsonify({'error': 'Log entry not found'}), 404
    from webhook_service import _send_webhook, _sign_payload
    try:
        payload = json.loads(log_entry.payload)
    except (json.JSONDecodeError, TypeError):
        return jsonify({'error': 'Invalid payload in log'}), 500
    new_log = WebhookLog(
        webhook_id=wid, event_type=log_entry.event_type,
        payload=log_entry.payload,
    )
    db.session.add(new_log); db.session.commit()
    _send_webhook(wh, log_entry.event_type, payload, new_log)
    new_log.completed_at = datetime.now(timezone.utc)
    db.session.commit()
    return jsonify({
        'message': 'Retry completed',
        'success': new_log.success,
        'response_status': new_log.response_status,
        'error_message': new_log.error_message,
    })

@app.route('/api/webhooks/events', methods=['GET'])
def list_webhook_events():
    """Return available webhook events."""
    return jsonify(WEBHOOK_EVENTS)

@app.route('/api/webhooks/ai-assist', methods=['POST'])
@limiter.limit("5 per minute")
def webhook_ai_assist():
    """Use AI to generate webhook config from natural language."""
    user = login_required()
    if not user: return jsonify({'error': 'Not logged in'}), 401
    data = request.get_json()
    if not data or not data.get('prompt', '').strip():
        return jsonify({'error': 'Prompt is required'}), 400
    prompt = data['prompt'].strip()
    # Use DeepSeek API if configured, otherwise provide template response
    ai_key = os.environ.get('DEEPSEEK_API_KEY', '')
    if ai_key:
        try:
            resp = requests.post('https://api.deepseek.com/v1/chat/completions', json={
                'model': 'deepseek-chat',
                'messages': [
                    {'role': 'system', 'content': (
                        'You are a webhook configuration assistant for Timely scheduling app. '
                        'Given a natural language request, output JSON only with fields: '
                        'event (string), url (string), payload (object with field names as keys and descriptions as values). '
                        'Available events: ' + ', '.join(WEBHOOK_EVENTS)
                    )},
                    {'role': 'user', 'content': prompt},
                ],
                'temperature': 0.1,
                'max_tokens': 500,
            }, headers={
                'Authorization': f'Bearer {ai_key}',
                'Content-Type': 'application/json',
            }, timeout=15)
            if resp.ok:
                content = resp.json()['choices'][0]['message']['content']
                try:
                    suggestion = json.loads(content)
                    return jsonify(suggestion)
                except (json.JSONDecodeError, KeyError):
                    return jsonify({'suggestion': content, 'note': 'Raw AI response'})
            return jsonify({'error': 'AI service error: ' + resp.text[:200]}), 502
        except Exception as e:
            return jsonify({'error': f'AI request failed: {e}'}), 502
    # No AI key — provide template suggestion based on keywords
    prompt_lower = prompt.lower()
    suggestion = {'event': 'event.created', 'url': '', 'payload': {}}
    if 'slack' in prompt_lower:
        suggestion['url'] = 'https://hooks.slack.com/services/...'
        suggestion['payload'] = {
            'text': 'New event: {{title}} at {{start}}-{{end}}',
            'channel': '#schedule',
        }
    elif 'discord' in prompt_lower:
        suggestion['url'] = 'https://discord.com/api/webhooks/...'
        suggestion['payload'] = {
            'content': '📅 **{{title}}** — {{start}} to {{end}}',
            'username': 'Timely Bot',
        }
    elif 'telegram' in prompt_lower:
        suggestion['url'] = 'https://api.telegram.org/bot<TOKEN>/sendMessage'
        suggestion['payload'] = {
            'chat_id': '<CHAT_ID>',
            'text': '📅 {{title}} at {{start}}',
        }
    if 'completed' in prompt_lower or 'done' in prompt_lower:
        suggestion['event'] = 'task.completed'
    elif 'remind' in prompt_lower or 'notify' in prompt_lower or 'alert' in prompt_lower:
        suggestion['event'] = 'reminder.triggered'
    elif 'created' in prompt_lower or 'new' in prompt_lower or 'add' in prompt_lower:
        suggestion['event'] = 'event.created'
    elif 'delete' in prompt_lower or 'remove' in prompt_lower:
        suggestion['event'] = 'event.deleted'
    elif 'update' in prompt_lower:
        suggestion['event'] = 'event.updated'
    return jsonify(suggestion)

# ─── iCal Export ───
@app.route('/api/ical')
def export_ical():
    user = login_required()
    if not user: return jsonify({'error': 'Not logged in'}), 401
    return Response(ical_for_user(user), mimetype='text/calendar',
        headers={'Content-Disposition': 'attachment; filename=schedule.ics'})

@app.route('/api/ical/feed/<token>')
def ical_feed(token):
    user = User.query.filter_by(ical_token=token).first()
    if not user: return jsonify({'error': 'Not found'}), 404
    return Response(ical_for_user(user), mimetype='text/calendar')

def ical_escape(text):
    """Escape text for iCal fields (RFC 5545)."""
    return text.replace('\\', '\\\\').replace(';', '\\;').replace(',', '\\,').replace('\n', '\\n')

def ical_for_user(user):
    events = Event.query.filter_by(user_id=user.id).all()
    lines = [
        'BEGIN:VCALENDAR',
        'VERSION:2.0',
        'PRODID:-//Timetable//EN',
        'CALSCALE:GREGORIAN',
        'X-WR-CALNAME:Weekly Schedule',
    ]
    now = datetime.now(timezone.utc)
    day_codes = ['MO','TU','WE','TH','FR','SA','SU']
    # Find the actual date for each weekday in the current week
    monday = now.date() - timedelta(days=now.weekday())
    for e in events:
        try:
            start_h, start_m = map(int, e.start_time.split(':'))
            end_h, end_m = map(int, e.end_time.split(':'))
        except (ValueError, AttributeError):
            continue
        event_date = monday + timedelta(days=e.day)
        uid = f'{e.id}@{user.ical_token}'
        lines.extend([
            'BEGIN:VEVENT',
            f'UID:{uid}',
            f'DTSTART;TZID=Asia/Colombo:{event_date.year}{event_date.month:02d}{event_date.day:02d}T{start_h:02d}{start_m:02d}00',
            f'DTEND;TZID=Asia/Colombo:{event_date.year}{event_date.month:02d}{event_date.day:02d}T{end_h:02d}{end_m:02d}00',
        ])
        if e.repeat == 'weekly':
            lines.append(f'RRULE:FREQ=WEEKLY;BYDAY={day_codes[e.day]}')
        lines.append(f'SUMMARY:{ical_escape(e.title)}')
        if e.note:
            lines.append(f'DESCRIPTION:{ical_escape(e.note)}')
        lines.append('END:VEVENT')
    lines.append('END:VCALENDAR')
    return '\r\n'.join(lines) + '\r\n'

# ─── Share ───
@app.route('/api/share')
def get_share_info():
    user = login_required()
    if not user: return jsonify({'error': 'Not logged in'}), 401
    domain = request.host_url.rstrip('/')
    return jsonify({
        'share_url': f'{domain}/share/{user.share_token}',
        'ical_url': f'{domain}/api/ical/feed/{user.ical_token}',
    })

@app.route('/api/share/refresh', methods=['POST'])
def refresh_share_token():
    user = login_required()
    if not user: return jsonify({'error': 'Not logged in'}), 401
    user.share_token = str(uuid.uuid4())
    user.ical_token = str(uuid.uuid4())
    db.session.commit()
    domain = request.host_url.rstrip('/')
    return jsonify({
        'share_url': f'{domain}/share/{user.share_token}',
        'ical_url': f'{domain}/api/ical/feed/{user.ical_token}',
        'share_token': user.share_token,
        'ical_token': user.ical_token,
    })

@app.route('/share/<token>')
def shared_view(token):
    user = User.query.filter_by(share_token=token).first()
    if not user: return 'Not found', 404
    events = Event.query.filter_by(user_id=user.id).all()
    h = '<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Shared Schedule</title>'
    h += '<style>body{font-family:system-ui;background:#f8f5f0;padding:1.5rem;color:#2d2a24}'
    h += 'h1{font-size:1.3rem}h2{font-size:1rem;margin-top:1.5rem;color:#6a5f52}'
    h += '.ev{background:#fff;border-radius:10px;padding:.6rem .8rem;margin:.3rem 0;box-shadow:0 1px 4px rgba(0,0,0,.06)}'
    h += '.ev .t{font-weight:600}.ev .s{font-size:.8rem;color:#8a7a6a}</style></head><body>'
    h += f'<h1>📅 {html.escape(user.username)}\'s Schedule</h1>'
    days = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday']
    for di in range(7):
        day_evs = [e for e in events if e.day == di]
        if not day_evs: continue
        h += f'<h2>{days[di]}</h2>'
        for e in sorted(day_evs, key=lambda x: x.start_time):
            h += f'<div class="ev"><div class="t">{html.escape(e.title)}</div><div class="s">{html.escape(e.start_time)}–{html.escape(e.end_time)}</div></div>'
    h += '</body></html>'
    return h

# ─── Public: Active Banner Announcements ───
@app.route('/api/announcements/active')
def get_active_announcements():
    """Return active banner announcements for all users."""
    now = datetime.now(timezone.utc)
    announcements = Announcement.query.filter_by(active=True, type='banner').all()
    return jsonify([{
        'id': a.id, 'message': a.message,
        'created_at': a.created_at.isoformat() if a.created_at else None,
    } for a in announcements])

# ─── Mobile Sync Endpoint ───
@app.route('/api/sync')
def mobile_sync():
    """Return all events + metadata for mobile app sync."""
    user = login_required()
    if not user: return jsonify({'error': 'Not logged in'}), 401

    events = Event.query.filter_by(user_id=user.id).order_by(Event.day, Event.start_time).all()
    categories = Category.query.filter_by(user_id=user.id).all()

    # Collect unique locations from events
    all_locations = sorted(set(
        e.location.strip() for e in events if e.location and e.location.strip()
    ))

    return jsonify({
        'events': [{
            'id': e.id, 'title': e.title, 'day': e.day,
            'start_time': e.start_time, 'end_time': e.end_time,
            'category': e.category or '', 'color': e.color or '#c4956a',
            'location': e.location or '', 'repeat': e.repeat or 'none',
            'notify_before': e.notify_before or 15,
        } for e in events],
        'categories': [{'name': c.name, 'color': c.color} for c in categories],
        'locations': all_locations,
        'announcements': [],
        'timestamp': datetime.now(timezone.utc).isoformat(),
    })

# ─── Admin Routes ───
def _admin_check():
    """Returns (user, None) or (None, error_response)."""
    if 'user_id' not in session:
        return None, (jsonify({'error': 'Not logged in'}), 401)
    user = db.session.get(User, session['user_id'])
    if not user or not user.is_admin:
        return None, (jsonify({'error': 'Admin access required'}), 403)
    return user, None

@app.route('/api/admin/users')
def admin_list_users():
    """List all users with event counts."""
    _, err = _admin_check()
    if err: return err
    users = User.query.order_by(User.created_at.desc()).all()
    result = []
    for u in users:
        event_count = Event.query.filter_by(user_id=u.id).count()
        result.append({
            'id': u.id, 'username': u.username, 'email': u.email,
            'theme': u.theme, 'is_admin': u.is_admin,
            'telegram_chat_id': u.telegram_chat_id,
            'event_count': event_count,
            'created_at': u.created_at.isoformat() if u.created_at else None,
        })
    return jsonify(result)

@app.route('/api/admin/users/<int:uid>', methods=['DELETE'])
def admin_delete_user(uid):
    """Delete a user and all their data."""
    _, err = _admin_check()
    if err: return err
    user = db.session.get(User, uid)
    if not user:
        return jsonify({'error': 'User not found'}), 404
    if user.is_admin:
        return jsonify({'error': 'Cannot delete another admin'}), 403
    username = user.username
    # Delete events, categories, bot state
    Event.query.filter_by(user_id=uid).delete()
    Category.query.filter_by(user_id=uid).delete()
    if user.telegram_chat_id:
        BotState.query.filter_by(chat_id=user.telegram_chat_id).delete()
    db.session.delete(user)
    db.session.commit()
    return jsonify({'message': f'User "{username}" and all their data deleted'})

@app.route('/api/admin/stats')
def admin_stats():
    """System statistics."""
    _, err = _admin_check()
    if err: return err
    return jsonify({
        'total_users': User.query.count(),
        'total_events': Event.query.count(),
        'total_categories': Category.query.count(),
        'total_admins': User.query.filter_by(is_admin=True).count(),
    })

@app.route('/api/admin/bot-settings', methods=['GET'])
def admin_get_bot_settings():
    """Get current bot config (token masked)."""
    _, err = _admin_check()
    if err: return err
    token = os.environ.get('TELEGRAM_BOT_TOKEN', '')
    masked = token[:8] + '...' + token[-4:] if len(token) > 12 else ''
    return jsonify({
        'bot_token_masked': masked,
        'bot_token_exists': bool(token),
        'webhook_url': os.environ.get('WEBHOOK_URL', ''),
    })

@app.route('/api/admin/bot-settings', methods=['PUT'])
def admin_update_bot_settings():
    """Update bot token and webhook — writes env.conf + restarts service."""
    _, err = _admin_check()
    if err: return err
    data = request.get_json()
    if not data: return jsonify({'error': 'Invalid request'}), 400

    new_token = data.get('bot_token', '').strip()
    new_webhook = data.get('webhook_url', '').strip()

    if not new_token:
        return jsonify({'error': 'Bot token required'}), 400
    # Validate Telegram bot token format: digits:alphanumeric
    if not re.match(r'^\d+:[\w-]+$', new_token):
        return jsonify({'error': 'Invalid bot token format'}), 400
    if len(new_token) > 60:
        return jsonify({'error': 'Bot token too long'}), 400
    if not new_webhook:
        new_webhook = 'https://timely.randillasith.me/api/bot-webhook'
    # Validate webhook URL
    if new_webhook and not new_webhook.startswith('https://'):
        return jsonify({'error': 'Webhook URL must use HTTPS'}), 400
    if len(new_webhook) > 500:
        return jsonify({'error': 'Webhook URL too long'}), 400

    # Update env.conf
    env_path = '/etc/systemd/system/timetable.service.d/env.conf'
    try:
        with open(env_path) as f:
            content = f.read()
        # Replace TELEGRAM_BOT_TOKEN line
        import re
        content = re.sub(
            r'TELEGRAM_BOT_TOKEN=[^\n]*',
            f'TELEGRAM_BOT_TOKEN={new_token}',
            content
        )
        content = re.sub(
            r'WEBHOOK_URL=[^\n]*',
            f'WEBHOOK_URL={new_webhook}',
            content
        )
        # Write via temp file + sudo
        import tempfile, subprocess, os as _os
        tmp = tempfile.NamedTemporaryFile(mode='w', delete=False, dir='/tmp')
        tmp.write(content)
        tmp.close()
        subprocess.run(['sudo', 'cp', tmp.name, env_path], check=True)
        _os.unlink(tmp.name)
        subprocess.run(['sudo', 'systemctl', 'daemon-reload'], check=True)
        subprocess.run(['sudo', 'systemctl', 'restart', 'timetable.service'], check=True)
        return jsonify({'message': 'Bot token updated — service restarted. Re-login if disconnected.'})
    except Exception as e:
        return jsonify({'error': f'Failed to update: {e}'}), 500

# ─── Admin: User Actions ───
@app.route('/api/admin/users/<int:uid>/reset-password', methods=['PUT'])
def admin_reset_password(uid):
    """Generate a temp password for a user."""
    _, err = _admin_check()
    if err: return err
    user = db.session.get(User, uid)
    if not user: return jsonify({'error': 'User not found'}), 404
    import secrets, string
    chars = string.ascii_letters + string.digits
    temp_pw = ''.join(secrets.choice(chars) for _ in range(10))
    user.password_hash = generate_password_hash(temp_pw)
    db.session.commit()
    return jsonify({'message': f'Password reset for {user.username}', 'temp_password': temp_pw})

@app.route('/api/admin/users/<int:uid>/toggle-admin', methods=['PUT'])
def admin_toggle_admin(uid):
    """Toggle admin status for a user (cannot toggle self)."""
    me, err = _admin_check()
    if err: return err
    if me.id == uid: return jsonify({'error': 'Cannot change your own status'}), 400
    user = db.session.get(User, uid)
    if not user: return jsonify({'error': 'User not found'}), 404
    user.is_admin = not user.is_admin
    db.session.commit()
    return jsonify({'message': f'{user.username} is now {"admin 👑" if user.is_admin else "user"}'})

# ─── Admin: Analytics ───
@app.route('/api/admin/analytics')
def admin_analytics():
    """Detailed analytics with engagement tracking."""
    _, err = _admin_check()
    if err: return err
    total_users = User.query.count()
    total_events = Event.query.count()
    telegram_active = User.query.filter(User.telegram_chat_id != '', User.telegram_notify == True).count()
    # Database size
    db_path = os.path.join(INSTANCE_DIR, 'timetable.db')
    db_size = os.path.getsize(db_path) if os.path.exists(db_path) else 0
    # Inactive users (no events, registered > 30 days ago)
    thirty_days_ago = datetime.utcnow() - timedelta(days=30)
    inactive_users = 0
    for u in User.query.all():
        if u.created_at and u.created_at.replace(tzinfo=None) < thirty_days_ago:
            ev = Event.query.filter_by(user_id=u.id).first()
            if not ev:
                inactive_users += 1
    return jsonify({
        'total_users': total_users,
        'total_events': total_events,
        'telegram_active': telegram_active,
        'db_size_bytes': db_size,
        'db_size_mb': round(db_size / (1024 * 1024), 2),
        'inactive_users': inactive_users,
    })

@app.route('/api/admin/bot-health')
def admin_bot_health():
    """Check Telegram bot webhook health."""
    _, err = _admin_check()
    if err: return err
    if not BOT_TOKEN:
        return jsonify({'healthy': False, 'error': 'No bot token configured', 'webhook': None})
    try:
        r = requests.post(f'{TELEGRAM_API}/getWebhookInfo', timeout=10)
        if r.ok:
            data = r.json().get('result', {})
            return jsonify({
                'healthy': data.get('url', '') != '',
                'webhook_url': data.get('url', ''),
                'pending_update_count': data.get('pending_update_count', 0),
                'last_error_date': data.get('last_error_date'),
                'last_error_message': data.get('last_error_message'),
                'max_connections': data.get('max_connections', 40),
            })
        return jsonify({'healthy': False, 'error': 'API call failed', 'webhook': None})
    except Exception as e:
        return jsonify({'healthy': False, 'error': str(e), 'webhook': None})

# ─── Admin: Global Presets ───
@app.route('/api/admin/presets')
def admin_get_presets():
    _, err = _admin_check()
    if err: return err
    presets = GlobalPreset.query.order_by(GlobalPreset.sort_order).all()
    return jsonify([{'id':p.id,'name':p.name,'color':p.color,'icon':p.icon,'sort_order':p.sort_order} for p in presets])

@app.route('/api/admin/presets', methods=['POST'])
def admin_create_preset():
    _, err = _admin_check()
    if err: return err
    data = request.get_json()
    if not data or not data.get('name'): return jsonify({'error': 'Name required'}), 400
    max_order = db.session.query(db.func.max(GlobalPreset.sort_order)).scalar() or 0
    preset = GlobalPreset(
        name=data['name'].strip(), color=data.get('color','#c4956a'),
        icon=data.get('icon','📌'), sort_order=max_order + 1,
    )
    db.session.add(preset); db.session.commit()
    return jsonify({'id': preset.id, 'message': 'Preset created'}), 201

@app.route('/api/admin/presets/<int:pid>', methods=['PUT'])
def admin_update_preset(pid):
    _, err = _admin_check()
    if err: return err
    preset = db.session.get(GlobalPreset, pid)
    if not preset: return jsonify({'error': 'Not found'}), 404
    data = request.get_json()
    if 'name' in data: preset.name = data['name'].strip()
    if 'color' in data: preset.color = data['color']
    if 'icon' in data: preset.icon = data['icon']
    if 'sort_order' in data: preset.sort_order = int(data['sort_order'])
    db.session.commit()
    return jsonify({'message': 'Preset updated'})

@app.route('/api/admin/presets/<int:pid>', methods=['DELETE'])
def admin_delete_preset(pid):
    _, err = _admin_check()
    if err: return err
    preset = db.session.get(GlobalPreset, pid)
    if not preset: return jsonify({'error': 'Not found'}), 404
    db.session.delete(preset); db.session.commit()
    return jsonify({'message': 'Preset deleted'})

# ─── Admin: Announcements ───
@app.route('/api/admin/announcements')
def admin_list_announcements():
    _, err = _admin_check()
    if err: return err
    anns = Announcement.query.order_by(Announcement.created_at.desc()).all()
    return jsonify([{
        'id': a.id, 'message': a.message, 'type': a.type, 'active': a.active,
        'created_at': a.created_at.isoformat() if a.created_at else None,
        'sent_at': a.sent_at.isoformat() if a.sent_at else None,
    } for a in anns])

@app.route('/api/admin/announcements', methods=['POST'])
def admin_create_announcement():
    _, err = _admin_check()
    if err: return err
    data = request.get_json()
    if not data or not data.get('message'): return jsonify({'error': 'Message required'}), 400
    ann = Announcement(
        message=data['message'].strip(),
        type=data.get('type', 'banner'),
        active=data.get('active', True),
    )
    db.session.add(ann); db.session.commit()
    return jsonify({'id': ann.id, 'message': 'Announcement created'}), 201

@app.route('/api/admin/announcements/<int:aid>', methods=['PUT'])
def admin_update_announcement(aid):
    _, err = _admin_check()
    if err: return err
    ann = db.session.get(Announcement, aid)
    if not ann: return jsonify({'error': 'Not found'}), 404
    data = request.get_json()
    if 'message' in data: ann.message = data['message'].strip()
    if 'type' in data: ann.type = data['type']
    if 'active' in data: ann.active = bool(data['active'])
    db.session.commit()
    return jsonify({'message': 'Announcement updated'})

@app.route('/api/admin/announcements/<int:aid>', methods=['DELETE'])
def admin_delete_announcement(aid):
    _, err = _admin_check()
    if err: return err
    ann = db.session.get(Announcement, aid)
    if not ann: return jsonify({'error': 'Not found'}), 404
    db.session.delete(ann); db.session.commit()
    return jsonify({'message': 'Announcement deleted'})

@app.route('/api/admin/announcements/<int:aid>/broadcast', methods=['POST'])
def admin_broadcast_announcement(aid):
    """Send a Telegram broadcast to all users with bot enabled."""
    _, err = _admin_check()
    if err: return err
    ann = db.session.get(Announcement, aid)
    if not ann: return jsonify({'error': 'Not found'}), 404
    if not ann.message.strip(): return jsonify({'error': 'Empty message'}), 400

    users = User.query.filter(User.telegram_chat_id != '', User.telegram_notify == True).all()
    sent = 0; failed = 0
    for u in users:
        try:
            r = requests.post(f'{TELEGRAM_API}/sendMessage', json={
                'chat_id': u.telegram_chat_id,
                'text': f'📢 <b>Announcement</b>\n\n{html.escape(ann.message)}',
                'parse_mode': 'HTML',
            }, timeout=10)
            if r.ok: sent += 1
            else: failed += 1
        except:
            failed += 1
    ann.sent_at = datetime.now(timezone.utc)
    db.session.commit()
    return jsonify({
        'message': f'Broadcast sent to {sent} users ({failed} failed)',
        'sent': sent, 'failed': failed, 'total': len(users),
    })

# ─── Background notifier ───
def _start_notifier():
    from notifier import check_and_notify
    t = threading.Thread(target=check_and_notify, args=(app,), daemon=True)
    t.start()
    print("[App] Notifier thread started")

# ─── Init ───
with app.app_context():
    migrate_db()

# Resolve persistent webhook secret (env var > DB > random)
if not WEBHOOK_SECRET:
    with app.app_context():
        try:
            s = AppSettings.query.filter_by(key='webhook_secret').first()
            if s and s.value:
                WEBHOOK_SECRET = s.value
            else:
                WEBHOOK_SECRET = secrets.token_hex(16)
                db.session.add(AppSettings(key='webhook_secret', value=WEBHOOK_SECRET))
                db.session.commit()
        except Exception:
            WEBHOOK_SECRET = secrets.token_hex(16)

# Set Telegram webhook on startup
if BOT_TOKEN:
    WEBHOOK_URL = os.environ.get('WEBHOOK_URL', 'https://timely.randillasith.me/api/bot-webhook')
    try:
        r = requests.post(f"{TELEGRAM_API}/setWebhook", json={
            'url': WEBHOOK_URL,
            'allowed_updates': ['message'],
            'secret_token': WEBHOOK_SECRET
        }, timeout=10)
        if r.ok:
            logging.info(f"[Bot] Webhook set to {WEBHOOK_URL}")
        else:
            logging.error(f"[Bot] Webhook failed: {r.text}")
    except Exception as e:
        logging.error(f"[Bot] Webhook setup error: {e}")

_start_notifier()

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000, debug=False)
