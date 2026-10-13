const currentUser = JSON.parse(localStorage.getItem("user"));
const page = window.location.pathname.split("/").pop();

if (!currentUser && ["booking.html", "mybookings.html", "bill.html"].includes(page)) {
  window.location.href = "login.html";
}

function logout() {
  const done = function () {
    localStorage.removeItem("user");
    localStorage.removeItem("token");
    window.location.href = "index.html";
  };
  api("/api/logout", { method: "POST" }).then(done, done);
}

async function api(path, options) {
  options = options || {};
  const headers = { "Content-Type": "application/json" };
  const token = localStorage.getItem("token");
  if (token) headers.Authorization = "Bearer " + token;

  let res;
  try {
    res = await fetch(path, {
      method: options.method || "GET",
      headers: headers,
      body: options.body ? JSON.stringify(options.body) : undefined
    });
  } catch (e) {
    throw new Error("Cannot reach the server. Please start it with start.bat (or: node backend/server.js).");
  }
  const data = await res.json().catch(function () { return {}; });

  if (res.status === 401 && token) {
    localStorage.removeItem("user");
    localStorage.removeItem("token");
    window.location.href = "login.html";
  }
  if (!res.ok) throw new Error(data.error || "Something went wrong.");
  return data;
}

if (window.location.protocol === "file:") {
  document.addEventListener("DOMContentLoaded", function () {
    document.body.insertAdjacentHTML("afterbegin",
      '<p style="background:#fff3cd;color:#664d03;padding:10px;text-align:center;margin:0">' +
      'Please open this site at <strong>http://localhost:3000</strong> after starting the server (start.bat). ' +
      'Opening the file directly will not save data.</p>');
  });
}

document.getElementById("siteHeader").innerHTML = `
  <a class="logo" href="index.html">🏟️ CityArena</a>
  <nav>
    <a href="index.html">Home</a>
    <a href="sports.html">Sports</a>
    <a href="booking.html">Book Now</a>
    <a href="about.html">About</a>
    <a href="mybookings.html">My Bookings</a>
    ${currentUser
      ? '<a href="#" onclick="logout()">Logout (' + currentUser.email + ')</a>'
      : '<a href="login.html">Login</a>'}
  </nav>`;

let takenSlots = [];

async function loadAvailability() {
  takenSlots = await api("/api/availability");
}

function pad(n) {
  return String(n).padStart(2, "0");
}

function toISO(d) {
  return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
}

function niceDate(iso) {
  const p = iso.split("-");
  return new Date(p[0], p[1] - 1, p[2]).toLocaleDateString("en-IN", {
    weekday: "short", day: "numeric", month: "short", year: "numeric"
  });
}

function formatHour(h) {
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return hour12 + ":00 " + (h < 12 ? "AM" : "PM");
}

function getNextDays() {
  const days = [];
  for (let i = 0; i < DAYS_AHEAD; i++) {
    const d = new Date();
    d.setDate(d.getDate() + i);
    days.push({
      iso: toISO(d),
      weekday: d.toLocaleDateString("en-IN", { weekday: "short" }),
      day: d.getDate(),
      month: d.toLocaleDateString("en-IN", { month: "short" })
    });
  }
  return days;
}

function getSlots(key) {
  const step = SPORTS[key].type === "court" ? 1 : 2;
  const slots = [];
  for (let h = OPEN_HOUR; h + step <= CLOSE_HOUR; h += step) {
    slots.push({ start: h, label: formatHour(h) + " - " + formatHour(h + step) });
  }
  return slots;
}

function capacity(key) {
  const s = SPORTS[key];
  return s.type === "court" ? s.courts * s.maxPerCourt : 1;
}

function hash(text) {
  let h = 0;
  for (let i = 0; i < text.length; i++) {
    h = (h * 31 + text.charCodeAt(i)) % 100000;
  }
  return h;
}

function spotsTaken(key, date, start) {
  const cap = capacity(key);
  const h = hash(key + date + start);
  let taken = 0;

  if (SHOW_DEMO_BUSY_SLOTS) {
    if (SPORTS[key].type === "court") {
      if (h % 5 === 0) taken = cap;
      else if (h % 3 === 0) taken = Math.floor(cap / 2);
    } else if (h % 4 === 0) {
      taken = 1;
    }
  }

  takenSlots.forEach(function (b) {
    if (b.sport === key && b.date === date && b.start === start) {
      taken += b.spots;
    }
  });
  return Math.min(taken, cap);
}

function spotsFree(key, date, start) {
  return capacity(key) - spotsTaken(key, date, start);
}

function calcBill(key, people) {
  const s = SPORTS[key];
  const base = s.type === "court" ? s.price * people : s.price;
  const gst = Math.round(base * GST_RATE);
  return { base: base, gst: gst, total: base + gst };
}

function rupees(n) {
  return "₹" + n.toLocaleString("en-IN");
}

function esc(text) {
  const d = document.createElement("div");
  d.textContent = text;
  return d.innerHTML.replace(/"/g, "&quot;");
}
