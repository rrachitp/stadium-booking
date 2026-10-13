const sportsList = document.getElementById("sportsList");
if (sportsList) {
  Object.keys(SPORTS).forEach(function (key) {
    const s = SPORTS[key];
    const info = s.type === "court"
      ? rupees(s.price) + " per person per hour<br>" + s.courts + " courts, up to " + s.maxPerCourt + " people each"
      : rupees(s.price) + " fixed per 2-hour slot<br>Whole ground, up to " + s.maxPlayers + " players";

    sportsList.innerHTML += `<div class="card">
      <div class="icon">${s.icon}</div>
      <h3>${s.name}</h3>
      <p>${info}</p>
      <a class="btn" href="booking.html?sport=${key}">Book</a>
    </div>`;
  });
}

async function showBookings() {
  const body = document.getElementById("bookingRows");
  if (!body) return;

  let list;
  try {
    list = await api("/api/my-bookings");
  } catch (err) {
    body.innerHTML = '<tr><td colspan="7">' + esc(err.message) + '</td></tr>';
    return;
  }
  if (list.length === 0) {
    body.innerHTML = '<tr><td colspan="7">No bookings yet. <a href="booking.html">Book a slot</a></td></tr>';
    return;
  }

  body.innerHTML = "";
  list.forEach(function (b) {
    body.innerHTML += `<tr>
      <td>${b.ref}</td>
      <td>${(SPORTS[b.sport] || { name: b.sport }).name}</td>
      <td>${niceDate(b.date)}<br>${b.slot}</td>
      <td>${b.players.length ? b.players.length : "Whole ground"}</td>
      <td>${rupees(b.total)}</td>
      <td><a href="bill.html?ref=${b.ref}">View bill</a></td>
      <td><button class="btn-danger" onclick="cancelBooking('${b.ref}')">Cancel</button></td>
    </tr>`;
  });
}

async function cancelBooking(ref) {
  if (!confirm("Cancel booking " + ref + "? Fees are not refunded.")) return;
  try {
    await api("/api/bookings/" + ref, { method: "DELETE" });
  } catch (err) {
    alert(err.message);
  }
  showBookings();
}
showBookings();

const billBox = document.getElementById("billBox");
async function showBill() {
  const ref = new URLSearchParams(window.location.search).get("ref");
  let b = null;
  try {
    b = await api("/api/bookings/" + encodeURIComponent(ref));
  } catch (err) {}

  if (!b) {
    billBox.innerHTML = '<p>Bill not found. <a href="mybookings.html">Go to My Bookings</a></p>';
  } else {
    const s = SPORTS[b.sport] || { name: b.sport, icon: "" };
    const players = b.players.length ? esc(b.players.join(", ")) : "Whole ground (fixed price)";

    billBox.innerHTML = `<div class="invoice">
      <h2>Booking confirmed ✔</h2>
      <p class="ref">Bill / Reference: ${b.ref}</p>
      <table class="bill-table">
        <tr><td>Booked by</td><td>${esc(b.name)} (+91 ${b.phone})</td></tr>
        <tr><td>Sport</td><td>${s.icon} ${s.name}</td></tr>
        <tr><td>Date</td><td>${niceDate(b.date)}</td></tr>
        <tr><td>Time</td><td>${b.slot}</td></tr>
        <tr><td>Players</td><td>${players}</td></tr>
        <tr><td>Amount</td><td>${rupees(b.base)}</td></tr>
        <tr><td>GST (18%)</td><td>${rupees(b.gst)}</td></tr>
        <tr class="grand"><td>Total paid</td><td>${rupees(b.total)}</td></tr>
        <tr><td>Paid with</td><td>${b.payMethod} on ${b.paidAt}</td></tr>
      </table>
      <p class="hint">Carry your ID and arrive on time. Fees are not refundable.</p>
      <div class="actions">
        <button class="btn" onclick="window.print()">Print bill</button>
        <a class="btn btn-secondary" href="mybookings.html">My bookings</a>
      </div>
    </div>`;

  }
}

if (billBox) showBill();
