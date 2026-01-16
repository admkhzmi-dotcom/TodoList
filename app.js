// app.js (type="module") — Firebase Realtime Database + Anonymous Auth

import { initializeApp } from "https://www.gstatic.com/firebasejs/12.8.0/firebase-app.js";
import { getAuth, signInAnonymously, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.8.0/firebase-auth.js";
import { getDatabase, ref, push, set, update, remove, onValue } from "https://www.gstatic.com/firebasejs/12.8.0/firebase-database.js";

console.log("APP.JS LOADED ✅"); // helps you confirm new code is running

const firebaseConfig = {
  apiKey: "AIzaSyAn6Iq50V1NU955Ec7iK4PGTAlZYcsBM18",
  authDomain: "todolist-ac818.firebaseapp.com",
  databaseURL: "https://todolist-ac818-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "todolist-ac818",
  storageBucket: "todolist-ac818.appspot.com",
  messagingSenderId: "269210163264",
  appId: "1:269210163264:web:7f69cb80beb7bc4736a7a5"
};

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

// State
let uid = null;
let todosMap = {};
let filter = "all";

// Auth
statusEl.textContent = "Signing in…";
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

// DB refs
const userTodosRef = () => ref(db, `users/${uid}/todos`);
const oneTodoRef = (todoId) => ref(db, `users/${uid}/todos/${todoId}`);

// Realtime sync
function subscribeTodos() {
  onValue(
    userTodosRef(),
    (snapshot) => {
      todosMap = snapshot.val() || {};
      render();
    },
    (err) => {
      console.error(err);
      statusEl.textContent = "Permission denied. Update RTDB rules.";
    }
  );
}

// Add todo
form.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!uid) return;

  const text = input.value.trim();
  if (!text) return;

  const due = dueInput.value ? dueInput.value : null;

  input.value = "";
  dueInput.value = "";

  const newRef = push(userTodosRef());
  await set(newRef, {
    text,
    done: false,
    due,
    createdAt: Date.now()
  });
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

  const todosArr = Object.entries(todosMap).map(([id, t]) => ({
    id,
    text: t?.text ?? "",
    done: !!t?.done,
    due: t?.due ?? null,
    createdAt: t?.createdAt ?? 0
  }));

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
    duePicker.addEventListener("change", () => updateTodoDue(t.id, duePicker.value ? duePicker.value : null));

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

function isOverdue(t) {
  if (!t.due || t.done) return false;
  const today = new Date();
  const due = new Date(t.due + "T00:00:00");
  const todayMid = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  return due < todayMid;
}
