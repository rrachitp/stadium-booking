# CityArena Stadium Booking (HTML + CSS + JavaScript + Node.js + SQLite)

## Project structure
```
stadium_booking/
├── start.bat            Windows launcher
├── start.sh             Mac/Linux launcher
├── README.md
├── backend/
│   ├── server.js        Node.js server: serves the frontend and the /api routes
│   └── stadium.db       SQLite database (created automatically on first start)
└── frontend/
    ├── index.html, sports.html, booking.html, bill.html,
    │   mybookings.html, login.html, about.html
    ├── css/
    │   └── style.css
    └── js/
        ├── data.js      Sports, prices, courts, timings (also read by the server)
        ├── script.js    Shared helpers used by every page
        ├── booking.js   Booking page
        ├── login.js     Login / register page
        └── pages.js     Sports, My Bookings and Bill pages
```

## Run it
1. Install Node.js (LTS version) from https://nodejs.org  (one time only)
2. Double-click `start.bat` (Windows) or run `./start.sh` (Mac/Linux).
   Or in a terminal inside this folder: `node backend/server.js`
3. Your browser opens http://localhost:3000

No `npm install` needed. No Python.

## Database
`backend/stadium.db` is created automatically the first time you start the server.
Users, bookings and logins are written to it instantly, and cancelled bookings are removed from it.
Open it any time with DB Browser for SQLite (https://sqlitebrowser.org) to see the tables like spreadsheets
(click "Browse Data", and the refresh button to see new changes).

Tables: `users`, `bookings`, `sessions`.

To start fresh, stop the server and delete `backend/stadium.db`.

## Edit prices / courts / timings
Change `frontend/js/data.js`, then restart the server.
Set `SHOW_DEMO_BUSY_SLOTS` to `false` there to show only real bookings from the database.

## Share on your Wi-Fi (optional)
Windows (cmd):  `set HOST=0.0.0.0 && node backend\server.js`
Other devices open http://YOUR-PC-IP:3000

## Sports offered
Badminton, Tennis, Table Tennis (per person per hour) and Football (fixed price per 2-hour slot).
Add or remove sports in `frontend/js/data.js`.

## What is saved in the `bookings` table
ref, user, email, name, phone, sport, date, slot, number of spots, **player names** (comma separated),
amount, GST, total, payment method and time paid.

## Live slots
The booking page re-checks the database every 5 seconds, so slots booked or cancelled by anyone update by themselves.
