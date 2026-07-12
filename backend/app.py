import os, uuid, textwrap, sqlite3, threading, requests, time
from datetime import datetime, timedelta
from flask import Flask, request, session, jsonify, Response
from flask_sqlalchemy import SQLAlchemy
from flask_cors import CORS
from werkzeug.security import generate_password_hash, check_password_hash

app = Flask(__name__, static_folder='../frontend/dist', static_url_path='/')
app.secret_key = os.environ.get('SECRET_KEY', 'change-this-in-production')
app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///' + os.path.join(
    os.path.dirname(os.path.abspath(__file__)), 'instance', 'timetable.db'
)
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
CORS(app, supports_credentials=True)

db = SQLAlchemy(app)
INSTANCE_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'instance')
os.makedirs(INSTANCE_DIR, exist_ok=True)

BOT_TOKEN = os.environ.get('TELEGRAM_BOT_TOKEN', '')
TELEGRAM_API = f"https://api.telegram.org/bot{BOT_TOKEN}"

# ─── Models ───
class User(db.Model):
    __tablename__ = 'users'
    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(80), unique=True, nullable=False)
    password_hash = db.Column(db.String(200), nullable=False)
    theme = db.Column(db.String(20), default='light')
    telegram_notify = db.Column(db.Boolean, default=False)
    telegram_chat_id = db.Column(db.String(50), default='')
    ical_token = db.Column(db.String(36), default=lambda: str(uuid.uuid4()))
    share_token = db.Column(db.String(36), default=lambda: str(uuid.uuid4()))
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

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
    return User.query.get(session['user_id'])

def day_name(d):
    return ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'][d]

# ─── Auth ───
@app.route('/')
def index():
    return app.send_static_file('index.html')

@app.route('/api/register', methods=['POST'])
def register():
    data = request.get_json()
    if not data: return jsonify({'error': 'Invalid request'}), 400
    username = data.get('username', '').strip()
    password = data.get('password', '')
    if not username or len(username) < 3: return jsonify({'error': 'Username needs 3+ chars'}), 400
    if not password or len(password) < 4: return jsonify({'error': 'Password needs 4+ chars'}), 400
    if User.query.filter_by(username=username).first():
        return jsonify({'error': 'Username taken'}), 409
    user = User(username=username, password_hash=generate_password_hash(password))
    db.session.add(user)
    db.session.commit()
    session['user_id'] = user.id
    session['username'] = user.username
    return jsonify({'message': 'Registered', 'username': user.username}), 201

@app.route('/api/login', methods=['POST'])
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
@app.route('/api/bot/confirm-connection', methods=['POST'])
def confirm_bot_connection():
    """When user saves their chat_id in settings, edit the welcome message."""
    user = login_required()
    if not user: return jsonify({'error': 'Not logged in'}), 401

    data = request.get_json()
    chat_id = (data or {}).get('chat_id', user.telegram_chat_id)

    if not chat_id:
        return jsonify({'error': 'No chat ID'}), 400

    state = BotState.query.get(chat_id)
    if state and state.welcome_message_id:
        # Edit the old welcome message to confirmation
        confirm = (
            f"✅ <b>Connected to Timetable!</b>\n\n"
            f"You'll now receive reminders here when events are about to start. 📅\n\n"
            f"🔧 Use /start to see your Chat ID again"
        )
        telegram_edit(chat_id, state.welcome_message_id, confirm)
        telegram_send(chat_id, "🔔 Notifications are now active! ✅")

    return jsonify({'message': 'Confirmed'})

# ─── Notification Settings (Telegram only) ───
@app.route('/api/notify-settings', methods=['GET'])
def get_notify_settings():
    user = login_required()
    if not user: return jsonify({'error': 'Not logged in'}), 401
    return jsonify({
        'telegram_notify': user.telegram_notify,
        'telegram_chat_id': user.telegram_chat_id,
    })

@app.route('/api/notify-settings', methods=['PUT'])
def update_notify_settings():
    user = login_required()
    if not user: return jsonify({'error': 'Not logged in'}), 401
    data = request.get_json()
    if not data: return jsonify({'error': 'Invalid request'}), 400
    if 'telegram_notify' in data: user.telegram_notify = bool(data['telegram_notify'])
    if 'telegram_chat_id' in data: user.telegram_chat_id = data['telegram_chat_id'].strip()
    db.session.commit()
    # If chat_id was just set, confirm connection with bot
    if user.telegram_chat_id and user.telegram_notify:
        try:
            requests.post(f"http://localhost:5000/api/bot/confirm-connection",
                json={'chat_id': user.telegram_chat_id}, timeout=5)
        except:
            pass
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
    if not data or not data.get('title') or data.get('day') is None:
        return jsonify({'error': 'Missing title or day'}), 400
    event = Event(
        user_id=user.id, day=int(data['day']),
        title=data['title'].strip(),
        start_time=data.get('start','09:00'),
        end_time=data.get('end','10:00'),
        category=data.get('category','task'),
        color=data.get('color') or None,
        note=data.get('note',''),
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
    if 'title' in data: event.title = data['title'].strip()
    if 'day' in data: event.day = int(data['day'])
    if 'start' in data: event.start_time = data['start']
    if 'end' in data: event.end_time = data['end']
    if 'category' in data: event.category = data['category']
    if 'color' in data: event.color = data['color'] or None
    if 'note' in data: event.note = data['note']
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
        'exported_at': datetime.utcnow().isoformat(),
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
    count = 0
    for e in data.get('events', []):
        if not e.get('title'): continue
        ev = Event(
            user_id=user.id, day=int(e.get('day',0)),
            title=e['title'].strip(),
            start_time=e.get('start','09:00'),
            end_time=e.get('end','10:00'),
            category=e.get('category','task'),
            color=e.get('color') or None,
            note=e.get('note',''),
            repeat=e.get('repeat','none')
        )
        db.session.add(ev); count += 1
    for c in data.get('categories', []):
        if not c.get('name'): continue
        cat = Category(
            user_id=user.id, name=c['name'].strip(),
            color=c.get('color','#c4956a'), icon=c.get('icon','📌')
        )
        db.session.add(cat)
    db.session.commit()
    return jsonify({'message': f'Imported {count} events'})

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

def ical_for_user(user):
    events = Event.query.filter_by(user_id=user.id).all()
    lines = [
        'BEGIN:VCALENDAR',
        'VERSION:2.0',
        'PRODID:-//Timetable//EN',
        'CALSCALE:GREGORIAN',
        'X-WR-CALNAME:Weekly Schedule',
    ]
    now = datetime.utcnow()
    for e in events:
        start_h, start_m = map(int, e.start_time.split(':'))
        end_h, end_m = map(int, e.end_time.split(':'))
        uid = f'{e.id}@{user.ical_token}'
        rrule = 'RRULE:FREQ=WEEKLY;BYDAY=' + ['MO','TU','WE','TH','FR','SA','SU'][e.day] if e.repeat == 'weekly' else ''
        lines.extend([
            'BEGIN:VEVENT',
            f'UID:{uid}',
            f'DTSTART;TZID=Asia/Colombo:{now.year}0101T{start_h:02d}{start_m:02d}00',
            f'DTEND;TZID=Asia/Colombo:{now.year}0101T{end_h:02d}{end_m:02d}00',
        ])
        if rrule:
            lines.append(rrule)
        lines.append(f'SUMMARY:{e.title}')
        if e.note:
            lines.append(f'DESCRIPTION:{e.note}')
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
    html = '<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Shared Schedule</title>'
    html += '<style>body{font-family:system-ui;background:#f8f5f0;padding:1.5rem;color:#2d2a24}'
    html += 'h1{font-size:1.3rem}h2{font-size:1rem;margin-top:1.5rem;color:#6a5f52}'
    html += '.ev{background:#fff;border-radius:10px;padding:.6rem .8rem;margin:.3rem 0;box-shadow:0 1px 4px rgba(0,0,0,.06)}'
    html += '.ev .t{font-weight:600}.ev .s{font-size:.8rem;color:#8a7a6a}</style></head><body>'
    html += f'<h1>📅 {user.username}\'s Schedule</h1>'
    days = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday']
    for di in range(7):
        day_evs = [e for e in events if e.day == di]
        if not day_evs: continue
        html += f'<h2>{days[di]}</h2>'
        for e in sorted(day_evs, key=lambda x: x.start_time):
            html += f'<div class="ev"><div class="t">{e.title}</div><div class="s">{e.start_time}–{e.end_time}</div></div>'
    html += '</body></html>'
    return html

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
            'allowed_updates': ['message']
        }, timeout=10)
        if r.ok:
            print(f"[Bot] Webhook set to {WEBHOOK_URL}")
        else:
            print(f"[Bot] Webhook failed: {r.text}")
    except Exception as e:
        print(f"[Bot] Webhook setup error: {e}")

_start_notifier()

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000, debug=True)
