const http = require("http");
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const crypto = require("crypto");
const { exec } = require("child_process");

const [major, minor] = process.versions.node.split(".").map(Number);
if (major < 22 || (major === 22 && minor < 13)) {
  console.log("\nYour Node.js version is " + process.versions.node + ", which is too old.");
  console.log("Please install the LTS version from https://nodejs.org and try again.\n");
  process.exit(1);
}
const emit = process.emit;
process.emit = function (name, data) {
  if (name === "warning" && data && /SQLite/.test(data.message || "")) return false;
  return emit.apply(process, arguments);
};
const { DatabaseSync } = require("node:sqlite");

const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || "127.0.0.1";
const BACKEND = __dirname;
const FRONTEND = path.join(__dirname, "..", "frontend");

const CONFIG = vm.runInNewContext(
  fs.readFileSync(path.join(FRONTEND, "js", "data.js"), "utf8") +
  "\n;({ SPORTS, OPEN_HOUR, CLOSE_HOUR, DAYS_AHEAD, GST_RATE })"
);
const { SPORTS, OPEN_HOUR, CLOSE_HOUR, DAYS_AHEAD, GST_RATE } = CONFIG;

const db = new DatabaseSync(path.join(BACKEND, "stadium.db"));
db.exec(`
  PRAGMA journal_mode = DELETE;
  PRAGMA foreign_keys = ON;

  CREATE TABLE IF NOT EXISTS users (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    name       TEXT NOT NULL,
    email      TEXT NOT NULL UNIQUE,
    phone      TEXT NOT NULL,
    password   TEXT NOT NULL,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS bookings (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    ref        TEXT NOT NULL UNIQUE,
    user_id    INTEGER NOT NULL REFERENCES users(id),
    email      TEXT NOT NULL,
    name       TEXT NOT NULL,
    phone      TEXT NOT NULL,
    sport      TEXT NOT NULL,
    date       TEXT NOT NULL,
    start      INTEGER NOT NULL,
    slot       TEXT NOT NULL,
    spots      INTEGER NOT NULL,
    players    TEXT NOT NULL,
    base       INTEGER NOT NULL,
    gst        INTEGER NOT NULL,
    total      INTEGER NOT NULL,
    pay_method TEXT NOT NULL,
    paid_at    TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS sessions (
    token      TEXT PRIMARY KEY,
    user_id    INTEGER NOT NULL REFERENCES users(id),
    created_at TEXT NOT NULL
  );
`);

class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  return salt + ":" + crypto.scryptSync(password, salt, 32).toString("hex");
}

function checkPassword(password, stored) {
  const [salt, hash] = stored.split(":");
  const test = crypto.scryptSync(password, salt, 32);
  return crypto.timingSafeEqual(test, Buffer.from(hash, "hex"));
}

function pad(n) { return String(n).padStart(2, "0"); }
function toISO(d) { return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()); }

function formatHour(h) {
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return hour12 + ":00 " + (h < 12 ? "AM" : "PM");
}

function validEmail(e) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e); }
function validPhone(p) { return /^[6-9][0-9]{9}$/.test(p); }

function bookingFromRow(r) {
  return {
    ref: r.ref, sport: r.sport, date: r.date, start: r.start, slot: r.slot, spots: r.spots,
    players: r.players ? r.players.split(", ") : [],
    name: r.name, phone: r.phone, email: r.email,
    base: r.base, gst: r.gst, total: r.total,
    payMethod: r.pay_method, paidAt: r.paid_at
  };
}

function getUser(req) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!token) throw new HttpError(401, "Please log in.");
  const user = db.prepare(
    "SELECT users.id, users.name, users.email, users.phone FROM sessions JOIN users ON users.id = sessions.user_id WHERE sessions.token = ?"
  ).get(token);
  if (!user) throw new HttpError(401, "Please log in again.");
  return { user, token };
}

function startSession(user) {
  const token = crypto.randomBytes(24).toString("hex");
  db.prepare("INSERT INTO sessions (token, user_id, created_at) VALUES (?, ?, ?)")
    .run(token, user.id, new Date().toISOString());
  return { token, user: { name: user.name, email: user.email, phone: user.phone } };
}

const routes = [];
function route(method, pattern, handler) { routes.push({ method, pattern, handler }); }

route("POST", /^\/api\/register$/, (req, body) => {
  const name = String(body.name || "").trim();
  const phone = String(body.phone || "").trim();
  const email = String(body.email || "").trim().toLowerCase();
  const password = String(body.password || "");

  if (name.length < 2) throw new HttpError(400, "Please enter your name.");
  if (!validPhone(phone)) throw new HttpError(400, "Enter a valid 10-digit mobile number.");
  if (!validEmail(email)) throw new HttpError(400, "Enter a valid email address.");
  if (password.length < 6) throw new HttpError(400, "Password must be at least 6 characters.");
  if (db.prepare("SELECT id FROM users WHERE email = ?").get(email)) {
    throw new HttpError(409, "This email is already registered. Please log in.");
  }

  const result = db.prepare(
    "INSERT INTO users (name, email, phone, password, created_at) VALUES (?, ?, ?, ?, ?)"
  ).run(name, email, phone, hashPassword(password), new Date().toISOString());
  return startSession({ id: Number(result.lastInsertRowid), name, email, phone });
});

route("POST", /^\/api\/login$/, (req, body) => {
  const email = String(body.email || "").trim().toLowerCase();
  const row = db.prepare("SELECT * FROM users WHERE email = ?").get(email);
  if (!row || !checkPassword(String(body.password || ""), row.password)) {
    throw new HttpError(401, "Wrong email or password.");
  }
  return startSession(row);
});

route("POST", /^\/api\/logout$/, (req) => {
  const { token } = getUser(req);
  db.prepare("DELETE FROM sessions WHERE token = ?").run(token);
  return { ok: true };
});

route("GET", /^\/api\/availability$/, () => {
  return db.prepare("SELECT sport, date, start, spots FROM bookings WHERE date >= ?").all(toISO(new Date()));
});

route("GET", /^\/api\/my-bookings$/, (req) => {
  const { user } = getUser(req);
  return db.prepare("SELECT * FROM bookings WHERE user_id = ? ORDER BY date, start").all(user.id).map(bookingFromRow);
});

route("GET", /^\/api\/bookings\/(BK\d+)$/, (req, body, match) => {
  const { user } = getUser(req);
  const row = db.prepare("SELECT * FROM bookings WHERE ref = ? AND user_id = ?").get(match[1], user.id);
  if (!row) throw new HttpError(404, "Booking not found.");
  return bookingFromRow(row);
});

route("POST", /^\/api\/bookings$/, (req, body) => {
  const { user } = getUser(req);

  const sport = SPORTS[body.sport];
  if (!sport) throw new HttpError(400, "Please choose a sport.");

  const allowedDates = [];
  for (let i = 0; i < DAYS_AHEAD; i++) {
    const d = new Date();
    d.setDate(d.getDate() + i);
    allowedDates.push(toISO(d));
  }
  const date = String(body.date || "");
  if (!allowedDates.includes(date)) throw new HttpError(400, "Please choose a valid day.");

  const step = sport.type === "court" ? 1 : 2;
  const start = Number(body.start);
  const validStart = Number.isInteger(start) && start >= OPEN_HOUR && start + step <= CLOSE_HOUR &&
    (start - OPEN_HOUR) % step === 0;
  if (!validStart) throw new HttpError(400, "Please choose a valid time slot.");
  if (date === toISO(new Date()) && start <= new Date().getHours()) {
    throw new HttpError(400, "That time has already passed.");
  }
  const slot = formatHour(start) + " - " + formatHour(start + step);

  const name = String(body.name || "").trim();
  const phone = String(body.phone || "").trim();
  if (name.length < 2) throw new HttpError(400, "Please enter your name.");
  if (!validPhone(phone)) throw new HttpError(400, "Enter a valid 10-digit mobile number.");

  let players = [];
  let spots = 1;
  let capacity = 1;
  if (sport.type === "court") {
    players = (Array.isArray(body.players) ? body.players : [])
      .map((p) => String(p).replace(/,/g, " ").trim());
    spots = players.length;
    capacity = sport.courts * sport.maxPerCourt;
    if (spots < 1 || spots > sport.maxPerCourt || players.some((p) => p.length < 2)) {
      throw new HttpError(400, "Please enter valid player names (max " + sport.maxPerCourt + ").");
    }
  }

  const method = String(body.payMethod || "");
  if (!["UPI", "Card", "Net banking"].includes(method)) throw new HttpError(400, "Please choose a payment method.");

  const base = sport.type === "court" ? sport.price * spots : sport.price;
  const gst = Math.round(base * GST_RATE);
  const total = base + gst;

  db.exec("BEGIN IMMEDIATE");
  try {
    const used = db.prepare(
      "SELECT COALESCE(SUM(spots), 0) AS n FROM bookings WHERE sport = ? AND date = ? AND start = ?"
    ).get(body.sport, date, start).n;
    if (used + spots > capacity) {
      throw new HttpError(409, "Sorry, this slot was just taken. Please choose another.");
    }

    let ref;
    do {
      ref = "BK" + String(crypto.randomInt(0, 10000000)).padStart(7, "0");
    } while (db.prepare("SELECT 1 FROM bookings WHERE ref = ?").get(ref));

    const paidAt = new Date().toLocaleString("en-IN");
    db.prepare(`INSERT INTO bookings
      (ref, user_id, email, name, phone, sport, date, start, slot, spots, players, base, gst, total, pay_method, paid_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(ref, user.id, user.email, name, phone, body.sport, date, start, slot, spots,
        players.join(", "), base, gst, total, method, paidAt);
    db.exec("COMMIT");
    return bookingFromRow(db.prepare("SELECT * FROM bookings WHERE ref = ?").get(ref));
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }
});

route("DELETE", /^\/api\/bookings\/(BK\d+)$/, (req, body, match) => {
  const { user } = getUser(req);
  const result = db.prepare("DELETE FROM bookings WHERE ref = ? AND user_id = ?").run(match[1], user.id);
  if (result.changes === 0) throw new HttpError(404, "Booking not found.");
  return { ok: true };
});

const TYPES = {
  ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8", ".png": "image/png", ".jpg": "image/jpeg",
  ".svg": "image/svg+xml", ".ico": "image/x-icon"
};

function sendJSON(res, status, data) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(data));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let text = "";
    req.on("data", (chunk) => {
      text += chunk;
      if (text.length > 100000) { reject(new HttpError(413, "Request too large.")); req.destroy(); }
    });
    req.on("end", () => {
      try { resolve(text ? JSON.parse(text) : {}); }
      catch { reject(new HttpError(400, "Bad request.")); }
    });
  });
}

function serveFile(req, res, urlPath) {
  let name = decodeURIComponent(urlPath);
  if (name === "/") name = "/index.html";
  const file = path.normalize(path.join(FRONTEND, name));
  const ext = path.extname(file).toLowerCase();

  const allowed = file.startsWith(path.resolve(FRONTEND) + path.sep) && TYPES[ext];
  if (!allowed || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    return res.end("Page not found");
  }
  res.writeHead(200, { "Content-Type": TYPES[ext], "Cache-Control": "no-cache" });
  fs.createReadStream(file).pipe(res);
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://localhost");

  if (!url.pathname.startsWith("/api/")) return serveFile(req, res, url.pathname);

  try {
    for (const r of routes) {
      const match = url.pathname.match(r.pattern);
      if (r.method === req.method && match) {
        const body = req.method === "POST" ? await readBody(req) : {};
        return sendJSON(res, 200, r.handler(req, body, match));
      }
    }
    throw new HttpError(404, "Unknown request.");
  } catch (err) {
    if (!(err instanceof HttpError)) console.error(err);
    sendJSON(res, err.status || 500, { error: err.status ? err.message : "Server error. Please try again." });
  }
});

server.on("error", (err) => {
  if (err.code === "EADDRINUSE") {
    console.log("\nPort " + PORT + " is already in use. Is the app already running in another window?");
    console.log("Close that window, or run on another port (for example: set PORT=3001 and start again).\n");
  } else {
    console.error(err);
  }
  process.exit(1);
});

server.listen(PORT, HOST, () => {
  const address = "http://localhost:" + PORT;
  console.log("\n  CityArena is running.");
  console.log("  Open this in your browser:  " + address);
  console.log("  Database file:              " + path.join(BACKEND, "stadium.db"));
  console.log("\n  Keep this window open while using the site. Press Ctrl+C to stop.\n");

  const opener = process.platform === "win32" ? 'start ""' : process.platform === "darwin" ? "open" : "xdg-open";
  exec(opener + " " + address, () => {});
});

process.on("SIGINT", () => { db.close(); process.exit(0); });
process.on("SIGTERM", () => { db.close(); process.exit(0); });
