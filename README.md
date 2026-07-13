# Timely ⏰

A **weekly schedule web app** with event management, Telegram reminders, password-protected accounts, and an elegant warm-themed UI.

🌐 **Live site**: [timely.randillasith.me](https://timely.randillasith.me)

---

## ✨ Features

| | Feature | Description |
|---|---|---|
| 📅 | **Weekly Timetable** | Visual calendar grid with colour-coded events by category |
| 🏷️ | **Custom Categories** | Predefined presets (Study, Lecture, Lab, Movie, Nap, etc.) with icons |
| 🔁 | **Repeat Events** | Set weekly repeating events that auto-populate |
| 🔔 | **Telegram Reminders** | Connect your Telegram account and get event notifications |
| 👤 | **User Accounts** | Register, login, change password — per-user private schedules |
| 🎨 | **Themes** | Light, Dark, Pink, Blue, Purple, Green — pick your mood |
| 📤 | **Import / Export** | JSON import/export to back up or transfer your schedule |
| 🔗 | **Share & iCal** | Public share link + iCal feed for external calendar apps |
| 📱 | **Responsive** | Works on mobile and desktop |
| 🔐 | **Admin Panel** | Manage users, presets, announcements (admin accounts) |

---

## 🚀 Tech Stack

| Layer | Technology |
|---|---|
| **Frontend** | React (Vite) — JSX, CSS |
| **Backend** | Python Flask, SQLAlchemy |
| **Database** | SQLite |
| **Bot** | Telegram Bot API (webhook-based) |
| **Email** | SMTP (custom mail server) |
| **Deployment** | Linux VPS, Systemd, Nginx |

---

## 📁 Project Structure

```
timely/
├── backend/
│   ├── app.py            # Flask server — API routes, auth, bot webhook
│   ├── notifier.py       # Background Telegram reminder notifier
│   ├── schema.sql        # Database schema
│   └── requirements.txt  # Python dependencies
├── frontend/
│   ├── src/
│   │   ├── App.jsx            # Root app component
│   │   ├── App.css            # Global styles
│   │   ├── api.js             # API client
│   │   ├── main.jsx           # Entry point
│   │   ├── components/
│   │   │   ├── Calendar.jsx       # Weekly timetable grid
│   │   │   ├── EventModal.jsx     # Add / Edit event modal
│   │   │   ├── SettingsPanel.jsx  # User settings (profile, password, theme, notify)
│   │   │   └── ThemePicker.jsx    # Theme selector
│   │   └── pages/
│   │       ├── Timetable.jsx  # Main timetable page
│   │       ├── Login.jsx      # Login form
│   │       ├── Register.jsx   # Registration form
│   │       └── Admin.jsx      # Admin panel
│   ├── public/             # Static assets, manifest, service worker
│   ├── package.json
│   └── vite.config.js
└── .gitignore
```

---

## 🛠️ Getting Started

### Prerequisites
- Python 3.11+
- Node.js 18+
- npm or yarn

### Backend

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python app.py
```

The server starts on `http://localhost:5000`.

### Frontend

```bash
cd frontend
npm install
npm run dev
```

Vite dev server runs on `http://localhost:5173`. Make sure the backend is running too.

### Environment Variables

| Variable | Description | Required |
|---|---|---|
| `SECRET_KEY` | Flask session secret | Recommended |
| `CORS_ORIGINS` | Comma-separated allowed origins | Optional |
| `TELEGRAM_BOT_TOKEN` | Telegram bot token for reminders | Optional |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASS` / `SMTP_FROM` | Email config | Optional |

---

## 📝 License

This project is open source and available under the [MIT License](LICENSE).

---

## 👨‍💻 Credits

**Created by**  
[Randil Lasith](https://github.com/randillasith) — design, development, and deployment.

**Built with AI assistance from**  
- **[Azuna](https://github.com/randillasith/hermes)** — an AI companion and development assistant
- **DeepSeek** — large language model providing reasoning and code generation
- **Hermes Agent** — autonomous agent framework by [Nous Research](https://nousresearch.com)

---

*Made with ☕ and a lot of late-night commits.*
