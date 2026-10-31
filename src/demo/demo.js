// Demo page behaviour (pricing toggle, form validation) + avatar setup.
import { init } from "../widget/index.js";

// ---- pricing toggle: changes page content live (the avatar re-reads it)
const monthly = document.getElementById("bill-monthly");
const yearly = document.getElementById("bill-yearly");
function setBilling(isYearly) {
  monthly.setAttribute("aria-pressed", String(!isYearly));
  yearly.setAttribute("aria-pressed", String(isYearly));
  for (const el of document.querySelectorAll(".price span[data-monthly]")) {
    el.textContent = isYearly ? el.dataset.yearly : el.dataset.monthly;
    el.nextElementSibling.textContent = el.dataset.monthly === "$0" ? " forever" : isYearly ? " per user / month, billed yearly" : " per user / month";
  }
}
monthly.addEventListener("click", () => setBilling(false));
yearly.addEventListener("click", () => setBilling(true));

// Choosing a plan pre-selects it in the signup form.
for (const a of document.querySelectorAll("[data-plan]")) {
  a.addEventListener("click", () => (document.getElementById("plan").value = a.dataset.plan));
}

// ---- form validation with custom messages
const password = document.getElementById("password");
const passwordError = document.getElementById("password-error");
function checkPassword() {
  const v = password.value;
  let msg = "";
  if (v && v.length < 10) msg = "Password must be at least 10 characters.";
  else if (v && !/\d/.test(v)) msg = "Password needs at least one number.";
  else if (v && !/[A-Z]/.test(v)) msg = "Password needs at least one uppercase letter.";
  password.setCustomValidity(msg);
  password.setAttribute("aria-invalid", msg ? "true" : "false");
  passwordError.textContent = msg;
}
password.addEventListener("input", checkPassword);

const email = document.getElementById("email");
email.addEventListener("input", () => {
  const free = /@(gmail|yahoo|hotmail|outlook)\./i.test(email.value);
  email.setCustomValidity(free ? "Please use your work email, not a personal address." : "");
});

for (const form of document.querySelectorAll("form.form")) {
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    if (form.id === "signup-form") checkPassword();
    for (const f of form.elements) if (f.willValidate) f.classList.add("touched");
    if (!form.checkValidity()) {
      form.querySelector(":invalid")?.focus();
      return;
    }
    form.querySelector(".success").hidden = false;
    form.querySelector("button[type=submit]").disabled = true;
  });
  form.addEventListener("focusout", (e) => e.target.classList?.add("touched"));
}

// ---- avatar guide
const guide = init({ apiUrl: "", modelUrl: "/models/avatar.vrm", name: "Ava" });
window.avatarGuide = guide;

for (const b of document.querySelectorAll("[data-ask]")) {
  b.addEventListener("click", () => guide.handleUserInput(b.dataset.ask, { viaVoice: false }));
}
