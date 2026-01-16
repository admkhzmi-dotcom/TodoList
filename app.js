import { initializeApp } from "https://www.gstatic.com/firebasejs/12.8.0/firebase-app.js";
import {
  getAuth,
  signInAnonymously,
  onAuthStateChanged,
  setPersistence,
  browserLocalPersistence
} from "https://www.gstatic.com/firebasejs/12.8.0/firebase-auth.js";
import { getDatabase, ref, push, set, update, remove, onValue } from "https://www.gstatic.com/firebasejs/12.8.0/firebase-database.js";
import { getMessaging, getToken, onMessage, isSupported } from "https://www.gstatic.com/firebasejs/12.8.0/firebase-messaging.js";

console.log("APP.JS LOADED ✅");

const firebaseConfig = {
  apiKey: "AIzaSyAn6Iq50V1NU955Ec7iK4PGTAlZYcsBM18",
  authDomain: "todolist-ac818.firebaseapp.com",
  databaseURL: "https://todolist-ac818-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "todolist-ac818",
  storageBucket: "todolist-ac818.appspot.com",
  messagingSenderId: "269210163264",
  appId: "1:269210163264:web:7f69cb80beb7bc4736a7a5"
};

// ✅ Your VAPID public key
const VAPID_KEY = "BCs7P3mKD1Qz9BCwy7S2OhzWoC-Oqe_zuJXLwrcgP5SWa63dnCy3ESk2xI7VTaONdh7yLBwP_dgLVFemJJn-_qo";

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);
const auth = getAuth(app);

// UI
const form = document.getElementById("todoForm");
const input = document.getElementById("todoInput");
const dueInput = document.getElementById("todoDue");
const list = document.getElementById("todoList");
const clearDoneBtn = document.getElementById("clearDone");
const counter = document.getElementById("counter");
const statusEl = document.getElementById("status");

const filterAllBtn = document.getElementById("filterAll");
const filterActiveBtn = document.getElementById("filterActive");
const filterDoneBtn = document.getElementById("filterDone");
const sortBySelect = document.getElementById("sortBy");

const enablePushBtn = document.getElementById("enablePush");

// State
let uid = null;
let todosMap = {};
let filter = "all";

// --------------------
// Date helpers
// --------------------
function dueMidnight(dueStr) {
  return new Date(dueStr + "T00:00:00");
}
function todayMidnight() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}
function isOverdue(t) {
  if (!t.due || t.done) return false;
  return dueMidnight(t.due) < todayMidnight();
}
function isDueWithinOneDay(t) {
  if (!t.due || t.done) return false;
  const diffDays = Math.round((dueMidnight(t.due) - todayMidnight()) / 86400000);
  return diffDays === 0 || diffDays === 1;
}

// --------------------
// Reminder system (when app is open)
// --------------------
const NOTIFIED_KEY = "todo_due_notified_open_v1";
let notified = loadNotified();

function loadNotified() {
  try { return JSON.parse(localStorage.getItem(NOTIFIED_KEY)) ?? {}; }
  catch { return {}; }
}
function saveNotified(map) {
  localStorage.setItem(NOTIFIED_KEY, JSON.stringify(map));
}
function notifyKey(todoId, dueStr) {
  return `${uid || "nouid"}__${todoId}__${dueStr || "nodue"}`;
}
function cleanupNotified(todosArr) {
  const valid = new Set(
    todosArr.filter(t => t.due && !t.done).map(t => notifyKey(t.id, t.due))
  );
  for (const k of Object.keys(notified)) {
    if (!valid.has(k)) delete notified[k];
  }
  saveNotified(notified);
}
async function ensurePermission() {
  if (!("Notification" in window)) return false;
  if (Notification.permission === "granted") return true;
  if (Notification.permission === "denied") return false;
  const p = await Notification.requestPermission();
  return p === "granted";
}
function todayStr() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}
function sendReminder(t) {
  const when = t.due === todayStr() ? "TODAY" : "TOMORROW";
  const msg = `Reminder: "${t.text}" is due ${when} (${t.due})`;

  if ("Notification" in window && Notification.permission === "granted") {
    new Notification("To-Do Reminder", { body: msg });
  } else {
    alert(msg);
  }
}
async function checkDueAlerts(todosArr) {
  if (!uid) return;

  cleanupNotified(todosArr);
  const dueSoon = todosArr.filter(isDueWithinOneDay);
  if (dueSoon.length === 0) return;

  await ensurePermission();

  for (const t of dueSoon) {
    const k = notifyKey(t.id, t.due);
    if (notified[k]) continue;
    notified[k] = Date.now();
    saveNotified(notified);
    sendReminder(t);
  }
}

// Periodic check while app is open
setInterval(() => {
  checkDueAlerts(mapToArray());
}, 60 * 1000);

// --------------------
// DB refs
// --------------------
const userTodosRef = () => ref(db, `users/${uid}/todos`);
const oneTodoRef = (todoId) => ref(db, `users/${uid}/todos/${todoId}`);
const userTokensRef = () => ref(db, `users/${uid}/fcmTokens`);

function mapToArray() {
  return Object.entries(todosMap).map(([id, t]) => ({
    id,
    text: t?.text ?? "",
    done: !!t?.done,
    due: t?.due ?? null,
    createdAt: t?.createdAt ?? 0
  }));
}

// --------------------
// Auto login (anonymous) + persistence
// --------------------
statusEl.textContent = "Signing in…";
await setPersistence(auth, browserLocalPersistence);

signInAnonymously(auth).catch((e) => {
  console.error(e);
  statusEl.textContent = "Auth error. Enable Anonymous Auth + Authorized Domains.";
});

onAuthStateChanged(auth, (user) => {
  if (!user) return;
  uid = user.uid;
  statusEl.textContent = "Synced ✓";
  subscribeTodos();
});

// --------------------
// Realtime sync
// --------------------
function subscribeTodos() {
  onValue(
    userTodosRef(),
    (snapshot) => {
      todosMap = snapshot.val() || {};
      render();
      checkDueAlerts(mapToArray());
    },
    (err) => {
      console.error(err);
      statusEl.textContent = "DB permission denied. Check RTDB rules.";
    }
  );
}

// --------------------
// Push Notifications (FCM) - enable by button click
// --------------------
enablePushBtn.addEventListener("click", async () => {
  if (!uid) {
    alert("Not signed in yet. Wait a moment and try again.");
    return;
  }

  const supported = await isSupported();
  if (!supported) {
    alert("Push notifications not supported in this browser.");
    return;
  }

  if (!("Notification" in window)) {
    alert("Notifications not available in this browser.");
    return;
  }

  const permission = await Notification.requestPermission();
  if (permission !== "granted") {
    alert("Notification permission not granted.");
    return;
  }

  const reg = await navigator.serviceWorker.ready;

  const messaging = getMessaging(app);
  const token = await getToken(messaging, {
    vapidKey: VAPID_KEY,
    serviceWorkerRegistration: reg
  });

  if (!token) {
    alert("No token returned. Check VAPID key + HTTPS + Firebase Authorized domain.");
    return;
  }

  await update(userTokensRef(), { [token]: true });

  alert("Push notifications enabled ✅");
  console.log("FCM token saved ✅", token);
});

// Foreground push messages
(async () => {
  const supported = await isSupported();
  if (!supported) return;

  const messaging = getMessaging(app);
  onMessage(messaging, (payload) => {
    console.log("Foreground push received:", payload);

    // Optional: show a notification even in foreground
    if ("Notification" in window && Notification.permission === "granted") {
      const title = payload?.notification?.title || "To-Do";
      const body = payload?.notification?.body || "New notification";
      new Notification(title, { body });
    }
  });
})();

// --------------------
// Add todo
// --------------------
form.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!uid) return;

  const text = input.value.trim();
  if (!text) return;

  const due = dueInput.value ? dueInput.value : null;

  // Better permission chance when user interacts
  if (due) {
    const temp = { due, done: false };
    if (isDueWithinOneDay(temp)) {
      await ensurePermission();
    }
  }

  input.value = "";
  dueInput.value = "";

  const newRef = push(userTodosRef());
  await set(newRef, { text, done: false, due, createdAt: Date.now() });
});

// Clear done
clearDoneBtn.addEventListener("click", async () => {
  const deletes = Object.entries(todosMap)
    .filter(([, t]) => t && t.done)
    .map(([id]) => remove(oneTodoRef(id)));

  await Promise.all(deletes);
});

// Filters
filterAllBtn.addEventListener("click", () => setFilter("all"));
filterActiveBtn.addEventListener("click", () => setFilter("active"));
filterDoneBtn.addEventListener("click", () => setFilter("done"));

function setFilter(next) {
  filter = next;
  updateFilterUI();
  render();
}
function updateFilterUI() {
  [filterAllBtn, filterActiveBtn, filterDoneBtn].forEach((b) => b.classList.remove("active"));
  if (filter === "all") filterAllBtn.classList.add("active");
  if (filter === "active") filterActiveBtn.classList.add("active");
  if (filter === "done") filterDoneBtn.classList.add("active");
}
sortBySelect.addEventListener("change", render);

// DB actions
const toggleDone = (id, currentDone) => update(oneTodoRef(id), { done: !currentDone });
const updateTodoDue = (id, due) => update(oneTodoRef(id), { due });
const deleteTodo = (id) => remove(oneTodoRef(id));
const editTodoText = async (id, oldText) => {
  const next = prompt("Edit task:", oldText);
  if (next === null) return;
  const trimmed = next.trim();
  if (!trimmed) return;
  await update(oneTodoRef(id), { text: trimmed });
};

// Render
function render() {
  list.innerHTML = "";
  const todosArr = mapToArray();
  const visible = applyFilter(applySort(todosArr, sortBySelect.value), filter);

  for (const t of visible) {
    const li = document.createElement("li");
    li.className = "item" + (t.done ? " done" : "") + (isOverdue(t) ? " overdue" : "");

    const left = document.createElement("div");
    left.className = "left";

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = t.done;
    checkbox.addEventListener("change", () => toggleDone(t.id, t.done));

    const textWrap = document.createElement("div");
    textWrap.className = "textWrap";

    const textLine = document.createElement("div");
    textLine.className = "text";
    textLine.textContent = t.text;
    textLine.addEventListener("dblclick", () => editTodoText(t.id, t.text));

    const meta = document.createElement("div");
    meta.className = "meta";

    const dueBadge = document.createElement("span");
    dueBadge.className = "badge";
    dueBadge.textContent = t.due ? `Due: ${t.due}` : "No due date";

    const duePicker = document.createElement("input");
    duePicker.type = "date";
    duePicker.value = t.due ?? "";
    duePicker.addEventListener("change", () =>
      updateTodoDue(t.id, duePicker.value ? duePicker.value : null)
    );

    meta.appendChild(dueBadge);
    meta.appendChild(duePicker);

    textWrap.appendChild(textLine);
    textWrap.appendChild(meta);

    left.appendChild(checkbox);
    left.appendChild(textWrap);

    const actions = document.createElement("div");
    actions.className = "actions";

    const delBtn = document.createElement("button");
    delBtn.type = "button";
    delBtn.className = "small";
    delBtn.textContent = "Delete";
    delBtn.addEventListener("click", () => deleteTodo(t.id));

    actions.appendChild(delBtn);

    li.appendChild(left);
    li.appendChild(actions);
    list.appendChild(li);
  }

  const remaining = todosArr.filter((t) => !t.done).length;
  counter.textContent = `${remaining} left • ${todosArr.length} total`;
}

function applyFilter(arr, f) {
  if (f === "active") return arr.filter((t) => !t.done);
  if (f === "done") return arr.filter((t) => t.done);
  return arr;
}
function applySort(arr, mode) {
  const byText = (a, b) => a.text.localeCompare(b.text);
  const dueTime = (t) => (t.due ? new Date(t.due + "T00:00:00").getTime() : Infinity);

  switch (mode) {
    case "added_asc": return arr.sort((a, b) => a.createdAt - b.createdAt);
    case "added_desc": return arr.sort((a, b) => b.createdAt - a.createdAt);
    case "due_asc": return arr.sort((a, b) => dueTime(a) - dueTime(b));
    case "due_desc": return arr.sort((a, b) => dueTime(b) - dueTime(a));
    case "az": return arr.sort(byText);
    case "za": return arr.sort((a, b) => byText(b, a));
    default: return arr;
  }
}
