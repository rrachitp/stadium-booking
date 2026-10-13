function initBooking() {
  const state = { sport: null, date: getNextDays()[0].iso, start: null, people: 1 };
  let pending = null;

  function el(id) {
    return document.getElementById(id);
  }

  function renderSports() {
    let html = "";
    Object.keys(SPORTS).forEach(function (key) {
      html += `<button type="button" class="chip" data-sport="${key}" aria-pressed="${state.sport === key}">
        <span class="chip-icon">${SPORTS[key].icon}</span>
        <strong>${SPORTS[key].name}</strong>
      </button>`;
    });
    el("sportChoice").innerHTML = html;
  }

  function renderDays() {
    el("dayChoice").innerHTML = getNextDays().map(function (d) {
      return `<button type="button" class="chip" data-date="${d.iso}" aria-pressed="${state.date === d.iso}">
        <strong>${d.weekday}</strong>
        <span>${d.day} ${d.month}</span>
      </button>`;
    }).join("");
  }

  function renderSlots() {
    if (!state.sport) {
      el("slotGrid").innerHTML = '<p class="hint">Choose a sport to see time slots.</p>';
      return;
    }
    const s = SPORTS[state.sport];
    const now = new Date();
    const isToday = state.date === toISO(now);

    el("slotGrid").innerHTML = getSlots(state.sport).map(function (slot) {
      const past = isToday && slot.start <= now.getHours();
      const free = past ? 0 : spotsFree(state.sport, state.date, slot.start);
      let note = "Available";
      if (past) note = "Time passed";
      else if (free === 0) note = "Fully booked";
      else if (s.type === "court") note = free + " spots left";

      return `<button type="button" class="chip" data-start="${slot.start}"
        aria-pressed="${state.start === slot.start}" ${free > 0 ? "" : "disabled"}>
        <strong>${slot.label}</strong>
        <span>${note}</span>
      </button>`;
    }).join("");
  }

  function renderPlayers() {
    const s = SPORTS[state.sport];
    const ready = s && state.start !== null;
    el("playersHint").hidden = ready;
    el("peopleBox").hidden = !(ready && s.type === "court");
    el("fixedNote").hidden = !(ready && s.type === "ground");
    if (!ready) return;

    if (s.type === "ground") {
      el("fixedNote").textContent = "Fixed price for the whole ground (up to " + s.maxPlayers +
        " players). You do not need to add player names.";
      return;
    }

    const oldNames = Array.from(document.querySelectorAll(".friend")).map(function (i) { return i.value; });
    const max = Math.min(s.maxPerCourt, spotsFree(state.sport, state.date, state.start));
    if (state.people > max) state.people = max;

    let options = "";
    for (let i = 1; i <= max; i++) {
      options += `<option value="${i}" ${i === state.people ? "selected" : ""}>${i} ${i === 1 ? "person" : "people"}</option>`;
    }
    el("people").innerHTML = options;
    el("maxNote").textContent = "Maximum " + max + " people for this slot.";

    let friends = "";
    for (let i = 1; i < state.people; i++) {
      friends += `<label>Friend ${i} name
        <input class="friend" type="text" value="${esc(oldNames[i - 1] || "")}">
      </label>`;
    }
    el("friends").innerHTML = friends;
  }

  function updatePrice() {
    if (!state.sport || state.start === null) {
      el("priceBox").textContent = "Choose a sport, day and slot to see the price.";
      return;
    }
    const bill = calcBill(state.sport, state.people);
    el("priceBox").textContent = "Amount " + rupees(bill.base) + " + GST " + rupees(bill.gst) +
      " = " + rupees(bill.total);
  }

  function refresh() {
    renderSports();
    renderDays();
    renderSlots();
    renderPlayers();
    updatePrice();
  }

  el("sportChoice").addEventListener("click", function (e) {
    const b = e.target.closest("[data-sport]");
    if (!b) return;
    state.sport = b.dataset.sport;
    state.start = null;
    state.people = 1;
    refresh();
  });

  el("dayChoice").addEventListener("click", function (e) {
    const b = e.target.closest("[data-date]");
    if (!b) return;
    state.date = b.dataset.date;
    state.start = null;
    refresh();
  });

  el("slotGrid").addEventListener("click", function (e) {
    const b = e.target.closest("[data-start]");
    if (!b || b.disabled) return;
    state.start = Number(b.dataset.start);
    renderSlots();
    renderPlayers();
    updatePrice();
  });

  el("people").addEventListener("change", function () {
    state.people = Number(el("people").value);
    renderPlayers();
    updatePrice();
  });

  el("toPay").addEventListener("click", async function () {
    try { await loadAvailability(); } catch (e) { el("msg").textContent = e.message; return; }
    const s = SPORTS[state.sport];
    const name = el("name").value.trim();
    const phone = el("phone").value.trim();
    const email = el("email").value.trim();
    const friends = Array.from(document.querySelectorAll(".friend")).map(function (i) { return i.value.trim(); });

    let error = "";
    if (!s) error = "Please choose a sport.";
    else if (state.start === null) error = "Please choose a time slot.";
    else if (name.length < 2) error = "Please enter your name.";
    else if (!/^[6-9][0-9]{9}$/.test(phone)) error = "Enter a valid 10-digit mobile number.";
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) error = "Enter a valid email address.";
    else if (friends.some(function (f) { return f.length < 2; })) error = "Please enter the name of every friend.";

    const spots = s && s.type === "court" ? state.people : 1;
    if (!error && spotsFree(state.sport, state.date, state.start) < spots) {
      error = "Sorry, this slot just filled up. Please choose another.";
    }
    el("msg").textContent = error;
    if (error) { refresh(); return; }

    const bill = calcBill(state.sport, state.people);
    pending = {
      sport: state.sport, date: state.date, start: state.start,
      slot: getSlots(state.sport).find(function (x) { return x.start === state.start; }).label,
      spots: spots,
      players: s.type === "court" ? [name].concat(friends) : [],
      name: name, phone: phone, email: currentUser.email,
      base: bill.base, gst: bill.gst, total: bill.total
    };

    el("paySummary").innerHTML =
      `<p><strong>${s.icon} ${s.name}</strong> on ${niceDate(pending.date)}, ${pending.slot}</p>
       <p>${s.type === "court" ? pending.players.length + " player(s): " + esc(pending.players.join(", ")) : "Whole ground, fixed price"}</p>
       <p>Amount ${rupees(bill.base)} + GST ${rupees(bill.gst)}</p>
       <p class="total">Total to pay: ${rupees(bill.total)}</p>`;
    el("payBtn").textContent = "Pay " + rupees(bill.total);
    el("stepBook").hidden = true;
    el("stepPay").hidden = false;
    window.scrollTo(0, 0);
  });

  function showPayFields() {
    const method = document.querySelector("input[name=pay]:checked").value;
    el("payUPI").hidden = method !== "UPI";
    el("payCard").hidden = method !== "Card";
    el("payNet").hidden = method !== "Net banking";
  }
  document.querySelectorAll("input[name=pay]").forEach(function (r) {
    r.addEventListener("change", showPayFields);
  });

  function checkPayment(method) {
    if (method === "UPI") {
      if (!/^[\w.\-]{2,}@[a-zA-Z]{2,}$/.test(el("upiId").value.trim())) return "Enter a valid UPI ID like name@bank.";
    } else if (method === "Card") {
      if (!/^\d{16}$/.test(el("cardNo").value.replace(/\s/g, ""))) return "Card number must be 16 digits.";
      const m = el("cardExp").value.trim().match(/^(0[1-9]|1[0-2])\/(\d{2})$/);
      if (!m) return "Enter expiry as MM/YY.";
      if (new Date(2000 + Number(m[2]), Number(m[1]), 1) <= new Date()) return "This card has expired.";
      if (!/^\d{3}$/.test(el("cardCvv").value.trim())) return "CVV must be 3 digits.";
    } else if (!el("bank").value) {
      return "Please choose your bank.";
    }
    return "";
  }

  el("backBtn").addEventListener("click", function () {
    el("stepPay").hidden = true;
    el("stepBook").hidden = false;
  });

  el("payBtn").addEventListener("click", function () {
    const method = document.querySelector("input[name=pay]:checked").value;
    const error = checkPayment(method);
    el("payMsg").textContent = error;
    if (error) return;

    el("payBtn").disabled = true;
    el("payBtn").textContent = "Processing payment...";

    setTimeout(async function () {
      pending.payMethod = method;
      try {
        const saved = await api("/api/bookings", { method: "POST", body: pending });
        window.location.href = "bill.html?ref=" + saved.ref;
      } catch (err) {
        el("payMsg").textContent = err.message;
        el("payBtn").disabled = false;
        el("payBtn").textContent = "Pay " + rupees(pending.total);
        loadAvailability().then(refresh).catch(function () {});
      }
    }, 1500);
  });

  el("name").value = currentUser.name;
  el("phone").value = currentUser.phone;
  el("email").value = currentUser.email;
  const chosen = new URLSearchParams(window.location.search).get("sport");
  if (SPORTS[chosen]) state.sport = chosen;
  refresh();

  setInterval(async function () {
    if (el("stepBook").hidden) return;
    try { await loadAvailability(); } catch (e) { return; }

    const s = SPORTS[state.sport];
    let playersChanged = false;
    if (s && state.start !== null) {
      const free = spotsFree(state.sport, state.date, state.start);
      const needed = s.type === "court" ? state.people : 1;
      if (free < 1) {
        state.start = null;
        el("msg").textContent = "That slot just filled up. Please choose another.";
        playersChanged = true;
      } else if (free < needed) {
        playersChanged = true;
      }
    }
    renderSlots();
    if (playersChanged) { renderPlayers(); updatePrice(); }
  }, 5000);
}

if (document.getElementById("bookingPage")) {
  loadAvailability().then(initBooking).catch(function (err) {
    document.getElementById("msg").textContent = err.message;
  });
}
