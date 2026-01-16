// --------------------
// PWA Cache
// --------------------
const CACHE_NAME = "todo-pwa-push-v1";
const APP_SHELL = [
  "./",
  "./index.html",
  "./style.css",
  "./app.js",
  "./manifest.json",
  "./icons/icon-192.png",
  "./icons/icon-512.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.map((k) => (k !== CACHE_NAME ? caches.delete(k) : null)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  event.respondWith(
    fetch(req)
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(req, copy));
        return res;
      })
      .catch(() => caches.match(req).then((cached) => cached || caches.match("./index.html")))
  );
});

// Click notification → open your GitHub Pages app
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const urlToOpen = "/TodoList/";

  event.waitUntil(
    (async () => {
      const allClients = await clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const client of allClients) {
        if ("focus" in client) {
          await client.focus();
          await client.navigate(urlToOpen);
          return;
        }
      }
      await clients.openWindow(urlToOpen);
    })()
  );
});

// --------------------
// Firebase Messaging (Compat SDK in Service Worker)
// --------------------
importScripts("https://www.gstatic.com/firebasejs/12.8.0/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/12.8.0/firebase-messaging-compat.js");

firebase.initializeApp({
  apiKey: "AIzaSyAn6Iq50V1NU955Ec7iK4PGTAlZYcsBM18",
  authDomain: "todolist-ac818.firebaseapp.com",
  databaseURL: "https://todolist-ac818-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "todolist-ac818",
  storageBucket: "todolist-ac818.appspot.com",
  messagingSenderId: "269210163264",
  appId: "1:269210163264:web:7f69cb80beb7bc4736a7a5"
});

const messaging = firebase.messaging();

// Receive push when app is in background/closed
messaging.onBackgroundMessage((payload) => {
  const title = payload?.notification?.title || "To-Do";
  const body = payload?.notification?.body || "New notification";

  self.registration.showNotification(title, {
    body,
    icon: "./icons/icon-192.png"
  });
});
