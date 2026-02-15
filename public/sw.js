self.addEventListener("push", (event) => {
  let payload = {};

  if (event.data) {
    try {
      payload = event.data.json();
    } catch {
      payload = {};
    }
  }

  const title = typeof payload.title === "string" && payload.title ? payload.title : "PadelYA";
  const body = typeof payload.body === "string" ? payload.body : "";
  const tag = typeof payload.tag === "string" ? payload.tag : undefined;
  const targetUrl =
    payload &&
    typeof payload === "object" &&
    payload.data &&
    typeof payload.data === "object" &&
    typeof payload.data.url === "string"
      ? payload.data.url
      : "/";

  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon: "/icon-192.png",
      badge: "/icon-192.png",
      tag,
      data: { url: targetUrl },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const rawUrl =
    event.notification &&
    event.notification.data &&
    typeof event.notification.data.url === "string"
      ? event.notification.data.url
      : "/";
  const destination = new URL(rawUrl, self.location.origin).toString();

  event.waitUntil(
    (async () => {
      const clientList = await clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });

      for (const client of clientList) {
        if ("focus" in client) {
          const currentUrl = new URL(client.url);
          const destinationUrl = new URL(destination);
          if (currentUrl.origin === destinationUrl.origin && currentUrl.pathname === destinationUrl.pathname) {
            await client.focus();
            if ("navigate" in client && client.url !== destination) {
              await client.navigate(destination);
            }
            return;
          }
        }
      }

      if (clients.openWindow) {
        await clients.openWindow(destination);
      }
    })(),
  );
});
