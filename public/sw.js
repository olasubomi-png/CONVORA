/* CONVORA service worker — Web Push */
self.addEventListener("push", (event) => {
  let data = { title: "CONVORA", body: "New message", url: "/app/inbox" };
  try {
    if (event.data) {
      data = { ...data, ...event.data.json() };
    }
  } catch {
    /* keep defaults */
  }
  const path =
    data.url ||
    (data.conversationId
      ? `/app/inbox?c=${data.conversationId}`
      : "/app/inbox");
  event.waitUntil(
    self.registration.showNotification(data.title || "CONVORA", {
      body: data.body || "New message",
      icon: "/favicon.ico",
      badge: "/favicon.ico",
      data: { url: path },
      tag: data.conversationId || "convora-msg",
      renotify: true,
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = (event.notification.data && event.notification.data.url) || "/app/inbox";
  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      for (const client of list) {
        if (client.url.includes("/app") && "focus" in client) {
          client.navigate(target);
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow(target);
      }
    }),
  );
});
