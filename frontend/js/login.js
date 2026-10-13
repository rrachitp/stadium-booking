function el(id) {
  return document.getElementById(id);
}

el("registerBtn").addEventListener("click", async function () {
  const name = el("regName").value.trim();
  const phone = el("regPhone").value.trim();
  const email = el("regEmail").value.trim().toLowerCase();
  const password = el("regPassword").value;

  let error = "";
  if (name.length < 2) error = "Please enter your name.";
  else if (!/^[6-9][0-9]{9}$/.test(phone)) error = "Enter a valid 10-digit mobile number.";
  else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) error = "Enter a valid email address.";
  else if (password.length < 6) error = "Password must be at least 6 characters.";
  el("regMsg").textContent = error;
  if (error) return;

  try {
    const result = await api("/api/register", {
      method: "POST",
      body: { name: name, phone: phone, email: email, password: password }
    });
    loginUser(result);
  } catch (err) {
    el("regMsg").textContent = err.message;
  }
});

el("loginBtn").addEventListener("click", async function () {
  try {
    const result = await api("/api/login", {
      method: "POST",
      body: { email: el("loginEmail").value.trim().toLowerCase(), password: el("loginPassword").value }
    });
    loginUser(result);
  } catch (err) {
    el("loginMsg").textContent = err.message;
  }
});

function loginUser(result) {
  localStorage.setItem("token", result.token);
  localStorage.setItem("user", JSON.stringify(result.user));
  window.location.href = "booking.html";
}

el("showRegister").addEventListener("click", function (e) {
  e.preventDefault();
  el("loginBox").hidden = true;
  el("registerBox").hidden = false;
});

el("showLogin").addEventListener("click", function (e) {
  e.preventDefault();
  el("registerBox").hidden = true;
  el("loginBox").hidden = false;
});
