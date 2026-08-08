self.addEventListener('push', (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = {};
  }

  const title = typeof payload.title === 'string' ? payload.title : 'Critical Matters Response';
  const body = typeof payload.body === 'string' ? payload.body : 'You have a private update.';
  const url = typeof payload.url === 'string' && payload.url.startsWith('/') ? payload.url : '/app';
  event.waitUntil(self.registration.showNotification(title, {
    body,
    icon: '/tgn-logo.svg',
    badge: '/tgn-logo.svg',
    tag: typeof payload.tag === 'string' ? payload.tag : 'cmr-update',
    renotify: true,
    data: { url },
  }));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const destination = new URL(event.notification.data?.url || '/app', self.location.origin).href;
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const matchingWindow = windows.find((client) => client.url.startsWith(self.location.origin));
    if (matchingWindow) {
      await matchingWindow.focus();
      return matchingWindow.navigate(destination);
    }
    return self.clients.openWindow(destination);
  })());
});
