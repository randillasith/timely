import os, uuid, html, sqlite3, threading, requests, time, re, logging, secrets
from datetime import datetime, timedelta, timezone
from flask import Flask, request, session, jsonify, Response
from flask_sqlalchemy import SQLAlchemy
from flask_cors import CORS
from flask_limiter import Limiter
from flask_limiter.util import get_remote_address
from werkzeug.security import generate_password_hash, check_password_hash

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

ALLOWED_ORIGINS = os.environ.get('CORS_ORIGINS', 'https://timetable.randillasith.me,http://localhost:5173').split(',')
CORS(app, origins=ALLOWED_ORIGINS, supports_credentials=True)

db = SQLAlchemy(app)
limiter = Limiter(get_remote_address, app=app, default_limits=["200 per day", "50 per hour"],
                  storage_uri="memory://")
INSTANCE_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'instance')
os.makedirs(INSTANCE_DIR, exist_ok=True)

BOT_TOKEN = os.environ.get('TELEGRAM_BOT_TOKEN', '')
TELEGRAM_API = f"https://api.telegram.org/bot{BOT_TOKEN}"
WEBHOOK_SECRET = os.environ.get('TELEGRAM_WEBHOOK_SECRET', secrets.token_hex(16))

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

class BotState(db.Model):
    __tablename__ = 'bot_state'
    chat_id = db.Column(db.String(50), primary_key=True)
    welcome_message_id = db.Column(db.Integer, default=None)

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
        ],
        'events': [
            ('category', 'VARCHAR(50)', "'task'"),
            ('color', 'VARCHAR(7)', 'NULL'),
            ('note', 'TEXT', "''"),
            ('repeat', 'VARCHAR(10)', "'none'"),
            ('notify_before', 'INTEGER', 'NULL'),
            ('notified', 'BOOLEAN', '0'),
        ],
        'categories': [
            ('color', 'VARCHAR(7)', "'#c4956a'"),
            ('icon', 'VARCHAR(10)', "'📌'"),
        ],
    }

    for table, cols in model_columns.items():
        cur.execute(f"PRAGMA table_info({table})")
        existing = {row[1] for row in cur.fetchall()}
        for col_name, col_type, default in cols:
            if col_name not in existing:
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
    if 'user_id' not in session: return None
    return db.session.get(User, session['user_id'])

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
    if not username or len(username) < 3: return jsonify({'error': 'Username needs 3+ chars'}), 400
    if len(username) > 80: return jsonify({'error': 'Username too long'}), 400
    if not re.match(r'^[a-zA-Z0-9_.\-]+$', username):
        return jsonify({'error': 'Username can only contain letters, numbers, dots, dashes, underscores'}), 400
    if not password or len(password) < 8: return jsonify({'error': 'Password needs 8+ chars'}), 400
    if User.query.filter_by(username=username).first():
        return jsonify({'error': 'Username taken'}), 409
    user = User(username=username, password_hash=generate_password_hash(password))
    db.session.add(user)
    db.session.commit()
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
    # Send welcome email in background thread
    if user.email:
        threading.Thread(target=send_welcome_email, args=(user.email, user.username), daemon=True).start()
    return jsonify({'message': 'Logged in', 'username': user.username, 'theme': user.theme})

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
        'share_token': user.share_token, 'ical_token': user.ical_token
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
    if token != WEBHOOK_SECRET:
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
            f"👋 <b>Welcome to Timetable Bot!</b>\n\n"
            f"Your Telegram Chat ID is:\n"
            f"<code>{chat_id}</code>\n\n"
            f"📌 <b>How to connect:</b>\n"
            f"1️⃣ Copy the Chat ID above\n"
            f"2️⃣ Go to your <a href=\"https://timetable.randillasith.me\">Timetable App</a>\n"
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

    return 'ok', 200

# ─── Confirm bot connection (called from settings when user saves chat_id) ───
def _confirm_bot(chat_id):
    """Edit the welcome message to show connected status. Called internally."""
    if not chat_id: return
    state = BotState.query.get(chat_id)
    if state and state.welcome_message_id:
        confirm = (
            f"✅ <b>Connected to Timetable!</b>\n\n"
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
    'from_name': os.environ.get('SMTP_FROM_NAME', 'Timetable'),
}

def send_welcome_email(to_email, username):
    """Send welcome email via SMTP. Runs in background thread."""
    if not to_email or not SMTP_CONFIG['pass']:
        return False
    try:
        import smtplib
        from email.mime.text import MIMEText
        body = f"""Hi {username},

Welcome to Timetable! 📅

Your schedule is ready to go. Start adding events and we'll send you reminders via Telegram.

Happy scheduling!
- Timetable Team
"""
        msg = MIMEText(body)
        msg['Subject'] = f"Welcome to Timetable, {username}! 🎉"
        msg['From'] = f"{SMTP_CONFIG['from_name']} <{SMTP_CONFIG['from']}>"
        msg['To'] = to_email

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
    })

@app.route('/api/notify-settings', methods=['PUT'])
def update_notify_settings():
    user = login_required()
    if not user: return jsonify({'error': 'Not logged in'}), 401
    data = request.get_json()
    if not data: return jsonify({'error': 'Invalid request'}), 400
    if 'email' in data: user.email = data['email'].strip()
    if 'telegram_notify' in data: user.telegram_notify = bool(data['telegram_notify'])
    if 'telegram_chat_id' in data: user.telegram_chat_id = data['telegram_chat_id'].strip()
    db.session.commit()
    # If chat_id was just set, confirm connection with bot directly
    if user.telegram_chat_id and user.telegram_notify:
        _confirm_bot(user.telegram_chat_id)
    return jsonify({'message': 'Settings updated'})

# ─── Categories ───
@app.route('/api/categories', methods=['GET'])
def get_categories():
    user = login_required()
    if not user: return jsonify({'error': 'Not logged in'}), 401
    cats = Category.query.filter_by(user_id=user.id).all()
    return jsonify([{'id':c.id,'name':c.name,'color':c.color,'icon':c.icon} for c in cats])

@app.route('/api/categories', methods=['POST'])
def create_category():
    user = login_required()
    if not user: return jsonify({'error': 'Not logged in'}), 401
    data = request.get_json()
    if not data or not data.get('name'): return jsonify({'error': 'Name required'}), 400
    cat = Category(user_id=user.id, name=data['name'].strip(),
        color=data.get('color','#c4956a'), icon=data.get('icon','📌'))
    db.session.add(cat); db.session.commit()
    return jsonify({'id': cat.id, 'message': 'Created'}), 201

@app.route('/api/categories/<int:cid>', methods=['PUT'])
def update_category(cid):
    user = login_required()
    if not user: return jsonify({'error': 'Not logged in'}), 401
    cat = Category.query.filter_by(id=cid, user_id=user.id).first()
    if not cat: return jsonify({'error': 'Not found'}), 404
    data = request.get_json()
    if 'name' in data: cat.name = data['name'].strip()
    if 'color' in data: cat.color = data['color']
    if 'icon' in data: cat.icon = data['icon']
    db.session.commit()
    return jsonify({'message': 'Updated'})

@app.route('/api/categories/<int:cid>', methods=['DELETE'])
def delete_category(cid):
    user = login_required()
    if not user: return jsonify({'error': 'Not logged in'}), 401
    cat = Category.query.filter_by(id=cid, user_id=user.id).first()
    if not cat: return jsonify({'error': 'Not found'}), 404
    db.session.delete(cat); db.session.commit()
    return jsonify({'message': 'Deleted'})

@app.route('/api/presets')
def get_presets():
    return jsonify([
        {'name':'Study','color':'#f5e6d8','icon':'📚'},
        {'name':'Class','color':'#e8e0f0','icon':'🏫'},
        {'name':'Movie','color':'#f0d8d8','icon':'🎬'},
        {'name':'Nap','color':'#d8e8e8','icon':'😴'},
        {'name':'OOP Videos','color':'#d8e8d0','icon':'📺'},
        {'name':'Database','color':'#d8d0e8','icon':'🗄️'},
        {'name':'Travel','color':'#f0ece4','icon':'🚶'},
        {'name':'Other','color':'#f5e6d8','icon':'📌'},
    ])

# ─── Events ───
@app.route('/api/events', methods=['GET'])
def get_events():
    user = login_required()
    if not user: return jsonify({'error': 'Not logged in'}), 401
    events = Event.query.filter_by(user_id=user.id).all()
    return jsonify([{
        'id':e.id,'day':e.day,'title':e.title,
        'start':e.start_time,'end':e.end_time,
        'category':e.category,'color':e.color,'note':e.note,'repeat':e.repeat,
        'notify_before':e.notify_before
    } for e in events])

@app.route('/api/events', methods=['POST'])
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
        notify_before=data.get('notify_before')
    )
    db.session.add(event)
    db.session.commit()
    return jsonify({'id': event.id, 'message': 'Created'}), 201

@app.route('/api/events/<int:eid>', methods=['PUT'])
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
    db.session.commit()
    return jsonify({'message': 'Updated'})

@app.route('/api/events/<int:eid>', methods=['DELETE'])
def delete_event(eid):
    user = login_required()
    if not user: return jsonify({'error': 'Not logged in'}), 401
    event = Event.query.filter_by(id=eid, user_id=user.id).first()
    if not event: return jsonify({'error': 'Not found'}), 404
    db.session.delete(event); db.session.commit()
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
    count = 0; skipped = 0
    for e in data.get('events', []):
        if not e.get('title'): continue
        key = (int(e.get('day', 0)), e['title'].strip(), e.get('start', '09:00'), e.get('end', '10:00'))
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
    if skipped: msg += f' ({skipped} duplicates skipped)'
    return jsonify({'message': msg})

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

# ─── Background notifier ───
def _start_notifier():
    from notifier import check_and_notify
    t = threading.Thread(target=check_and_notify, args=(app,), daemon=True)
    t.start()
    print("[App] Notifier thread started")

# ─── Init ───
with app.app_context():
    migrate_db()

# Set Telegram webhook on startup
if BOT_TOKEN:
    WEBHOOK_URL = os.environ.get('WEBHOOK_URL', 'https://timetable.randillasith.me/api/bot-webhook')
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
    app.run(host='0.0.0.0', port=5000, debug=True)
