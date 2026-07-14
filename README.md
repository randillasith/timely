# Timely ⏰

A **weekly schedule web app** with event management, Telegram reminders, timezone-aware current time indicator, drag & drop, and multiple view modes.

🌐 **Live site**: [timely.randillasith.me](https://timely.randillasith.me)

---

## ✨ Features

| | Feature | Description |
|---|---|---|
| 📅 | **Multiple Views** | Week grid, Month calendar, Agenda list |
| 🖱️ | **Drag & Drop** | Click & drag to move events; grab bottom edge to resize |
| 🔴 | **Live Time Line** | Apple Calendar-style red line showing current time (timezone-aware) |
| 🚫 | **Collision Detection** | Overlapping events split into separate columns automatically |
| 🏷️ | **Custom Categories** | Predefined presets + user-created with icons & colors |
| 🔁 | **Repeat Events** | Weekly repeating events |
| 🔔 | **Telegram Reminders** | Connect your Telegram, get notified before events |
| ⌨️ | **Keyboard Shortcuts** | `N` New · `←` `→` Navigate · `T` Today · `M` Switch Mode · `Esc` Close |
| 👤 | **User Accounts** | Register, login, change password |
| 🎨 | **Themes** | Light, Dark, Pink, Blue, Purple, Green |
| 🌍 | **Timezone Support** | Set your local timezone for the live time indicator |
| 📊 | **Semester Filter** | Organize events by semester and filter |
| 📤 | **Import / Export** | JSON backup & restore |
| 🔗 | **Share & iCal** | Public share link + iCal feed for external calendars |
| 🔐 | **Admin Panel** | User management, presets, announcements |

---

## 🚀 Tech Stack

| Layer | Technology |
|---|---|
| **Frontend** | React (Vite) — JSX, CSS |
| **Backend** | Python Flask, SQLAlchemy |
| **Database** | SQLite |
| **Bot** | Telegram Bot API (webhook) |
| **Email** | SMTP |
| **Deployment** | Linux VPS, Systemd, Nginx |

---

## 📁 Project Structure

```
timely/
├── backend/
│   ├── app.py            # Flask server — API, auth, bot webhook, notifications
│   ├── notifier.py       # Background Telegram reminder daemon
│   ├── schema.sql        # Database schema
│   └── requirements.txt  # Python deps
├── frontend/
│   ├── src/
│   │   ├── App.jsx / App.css    # Root + styles
│   │   ├── api.js               # API client
│   │   ├── main.jsx             # Entry point
│   │   ├── components/
│   │   │   ├── Calendar.jsx         # Week grid (drag, resize, collision)
│   │   │   ├── MonthView.jsx        # Month calendar view
│   │   │   ├── AgendaView.jsx       # Agenda list view
│   │   │   ├── EventModal.jsx       # Add/Edit event
│   │   │   ├── SettingsPanel.jsx    # Profile, password, timezone, notifications
│   │   │   └── ThemePicker.jsx      # Theme selector
│   │   └── pages/
│   │       ├── Timetable.jsx    # Main page (view switching, shortcuts)
│   │       ├── Login.jsx / Register.jsx
│   │       └── Admin.jsx        # Admin panel
│   ├── index.html
│   ├── package.json
│   └── vite.config.js
└── .env.example
```

---

## 🛠️ Getting Started

```bash
# Backend
cd backend
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
python app.py

# Frontend (separate terminal)
cd frontend
npm install
npm run dev
```

### Environment Variables
See `.env.example` for all available config.

---

## 👨‍💻 Credits

**Created by** [Randil Lasith](https://github.com/randillasith)

**Built with AI assistance from:**
- **Azuna** — AI companion and development assistant
- **DeepSeek** — Large language model
- **Hermes Agent** by [Nous Research](https://nousresearch.com)

---

*Made with ☕ and late-night commits.*
