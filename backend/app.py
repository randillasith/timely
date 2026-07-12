import os
from datetime import datetime
from flask import Flask, render_template, request, redirect, url_for, session, jsonify
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

os.makedirs(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'instance'), exist_ok=True)

# ─── Models ───
class User(db.Model):
    __tablename__ = 'users'
    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(80), unique=True, nullable=False)
    password_hash = db.Column(db.String(200), nullable=False)
    theme = db.Column(db.String(20), default='light')
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    events = db.relationship('Event', backref='user', lazy=True, cascade='all, delete-orphan')

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

# ─── Auth Routes ───
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
    if 'user_id' not in session:
        return jsonify({'error': 'Not logged in'}), 401
    user = User.query.get(session['user_id'])
    return jsonify({'username': user.username, 'theme': user.theme})

# ─── Theme ───
@app.route('/api/theme', methods=['PUT'])
def update_theme():
    if 'user_id' not in session:
        return jsonify({'error': 'Not logged in'}), 401
    data = request.get_json()
    theme = data.get('theme', 'light')
    if theme not in ('light', 'dark', 'pink', 'blue', 'purple', 'green'):
        return jsonify({'error': 'Invalid theme'}), 400
    user = User.query.get(session['user_id'])
    user.theme = theme
    db.session.commit()
    return jsonify({'theme': theme})

# ─── Categories API ───
@app.route('/api/categories', methods=['GET'])
def get_categories():
    if 'user_id' not in session: return jsonify({'error': 'Not logged in'}), 401
    cats = Category.query.filter_by(user_id=session['user_id']).all()
    return jsonify([{
        'id': c.id, 'name': c.name, 'color': c.color, 'icon': c.icon
    } for c in cats])

@app.route('/api/categories', methods=['POST'])
def create_category():
    if 'user_id' not in session: return jsonify({'error': 'Not logged in'}), 401
    data = request.get_json()
    if not data or not data.get('name'): return jsonify({'error': 'Name required'}), 400
    cat = Category(
        user_id=session['user_id'], name=data['name'].strip(),
        color=data.get('color', '#c4956a'), icon=data.get('icon', '📌')
    )
    db.session.add(cat)
    db.session.commit()
    return jsonify({'id': cat.id, 'message': 'Created'}), 201

@app.route('/api/categories/<int:cid>', methods=['PUT'])
def update_category(cid):
    if 'user_id' not in session: return jsonify({'error': 'Not logged in'}), 401
    cat = Category.query.filter_by(id=cid, user_id=session['user_id']).first()
    if not cat: return jsonify({'error': 'Not found'}), 404
    data = request.get_json()
    if 'name' in data: cat.name = data['name'].strip()
    if 'color' in data: cat.color = data['color']
    if 'icon' in data: cat.icon = data['icon']
    db.session.commit()
    return jsonify({'message': 'Updated'})

@app.route('/api/categories/<int:cid>', methods=['DELETE'])
def delete_category(cid):
    if 'user_id' not in session: return jsonify({'error': 'Not logged in'}), 401
    cat = Category.query.filter_by(id=cid, user_id=session['user_id']).first()
    if not cat: return jsonify({'error': 'Not found'}), 404
    db.session.delete(cat)
    db.session.commit()
    return jsonify({'message': 'Deleted'})

@app.route('/api/presets')
def get_presets():
    """Return the built-in preset categories."""
    return jsonify([
        {'name': 'Study', 'color': '#f5e6d8', 'icon': '📚'},
        {'name': 'Class', 'color': '#e8e0f0', 'icon': '🏫'},
        {'name': 'Movie', 'color': '#f0d8d8', 'icon': '🎬'},
        {'name': 'Nap', 'color': '#d8e8e8', 'icon': '😴'},
        {'name': 'OOP Videos', 'color': '#d8e8d0', 'icon': '📺'},
        {'name': 'Database', 'color': '#d8d0e8', 'icon': '🗄️'},
        {'name': 'Travel', 'color': '#f0ece4', 'icon': '🚶'},
        {'name': 'Other', 'color': '#f5e6d8', 'icon': '📌'},
    ])

# ─── Events API ───
@app.route('/api/events', methods=['GET'])
def get_events():
    if 'user_id' not in session: return jsonify({'error': 'Not logged in'}), 401
    events = Event.query.filter_by(user_id=session['user_id']).all()
    return jsonify([{
        'id': e.id, 'day': e.day, 'title': e.title,
        'start': e.start_time, 'end': e.end_time,
        'category': e.category, 'color': e.color, 'note': e.note
    } for e in events])

@app.route('/api/events', methods=['POST'])
def create_event():
    if 'user_id' not in session: return jsonify({'error': 'Not logged in'}), 401
    data = request.get_json()
    if not data or not data.get('title') or data.get('day') is None:
        return jsonify({'error': 'Missing title or day'}), 400
    event = Event(
        user_id=session['user_id'], day=int(data['day']),
        title=data['title'].strip(),
        start_time=data.get('start', '09:00'),
        end_time=data.get('end', '10:00'),
        category=data.get('category', 'task'),
        color=data.get('color') or None,
        note=data.get('note', '')
    )
    db.session.add(event)
    db.session.commit()
    return jsonify({'id': event.id, 'message': 'Created'}), 201

@app.route('/api/events/<int:eid>', methods=['PUT'])
def update_event(eid):
    if 'user_id' not in session: return jsonify({'error': 'Not logged in'}), 401
    event = Event.query.filter_by(id=eid, user_id=session['user_id']).first()
    if not event: return jsonify({'error': 'Not found'}), 404
    data = request.get_json()
    if 'title' in data: event.title = data['title'].strip()
    if 'day' in data: event.day = int(data['day'])
    if 'start' in data: event.start_time = data['start']
    if 'end' in data: event.end_time = data['end']
    if 'category' in data: event.category = data['category']
    if 'color' in data: event.color = data['color'] or None
    if 'note' in data: event.note = data['note']
    db.session.commit()
    return jsonify({'message': 'Updated'})

@app.route('/api/events/<int:eid>', methods=['DELETE'])
def delete_event(eid):
    if 'user_id' not in session: return jsonify({'error': 'Not logged in'}), 401
    event = Event.query.filter_by(id=eid, user_id=session['user_id']).first()
    if not event: return jsonify({'error': 'Not found'}), 404
    db.session.delete(event)
    db.session.commit()
    return jsonify({'message': 'Deleted'})

# ─── Init ───
with app.app_context():
    db.create_all()

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000, debug=True)
