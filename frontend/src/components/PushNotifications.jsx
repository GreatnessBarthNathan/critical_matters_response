import { useEffect, useState } from 'react';
import { Bell, BellOff } from 'lucide-react';
import { api } from '../api/client';

function isSupported() {
  return typeof window !== 'undefined'
    && 'serviceWorker' in navigator
    && 'PushManager' in window
    && 'Notification' in window;
}

function vapidKeyBytes(value) {
  const padded = `${value}${'='.repeat((4 - (value.length % 4)) % 4)}`;
  const base64 = padded.replaceAll('-', '+').replaceAll('_', '/');
  const bytes = atob(base64);
  return Uint8Array.from(bytes, (character) => character.charCodeAt(0));
}

export default function PushNotifications({ onChange }) {
  const [supported] = useState(isSupported);
  const [permission, setPermission] = useState(() => (isSupported() ? Notification.permission : 'unsupported'));
  const [enabled, setEnabled] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (!supported) return undefined;
    let active = true;
    navigator.serviceWorker.getRegistration().then(async (registration) => {
      const subscription = await registration?.pushManager.getSubscription();
      if (active) setEnabled(Boolean(subscription));
    }).catch(() => undefined);
    return () => { active = false; };
  }, [supported]);

  const enable = async () => {
    setLoading(true);
    setMessage('');
    try {
      const nextPermission = await Notification.requestPermission();
      setPermission(nextPermission);
      if (nextPermission !== 'granted') {
        setMessage('Browser notifications were not allowed. You can enable them later in your browser settings.');
        return;
      }
      const { publicKey } = await api('/notifications/public-key');
      const registration = await navigator.serviceWorker.register('/push-sw.js');
      await navigator.serviceWorker.ready;
      let subscription = await registration.pushManager.getSubscription();
      if (!subscription) {
        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: vapidKeyBytes(publicKey),
        });
      }
      await api('/notifications/subscriptions', { method: 'POST', body: { subscription: subscription.toJSON() } });
      setEnabled(true);
      setMessage('Notifications are enabled for this device.');
      onChange?.(true);
    } catch (error) {
      setMessage(error.message || 'Notifications could not be enabled.');
    } finally {
      setLoading(false);
    }
  };

  const disable = async () => {
    setLoading(true);
    setMessage('');
    try {
      const registration = await navigator.serviceWorker.getRegistration();
      const subscription = await registration?.pushManager.getSubscription();
      if (subscription) {
        await api('/notifications/subscriptions', { method: 'DELETE', body: { endpoint: subscription.endpoint } });
        await subscription.unsubscribe();
      }
      setEnabled(false);
      setMessage('Notifications are disabled for this device.');
      onChange?.(false);
    } catch (error) {
      setMessage(error.message || 'Notifications could not be disabled.');
    } finally {
      setLoading(false);
    }
  };

  if (!supported) return <p className="muted-note">Push notifications are not supported by this browser.</p>;
  if (permission === 'denied') return <p className="muted-note">Notifications are blocked in your browser settings.</p>;

  return (
    <div className="notification-preference">
      <p className="muted-note">Receive a generic alert when a private matter or response needs your attention. Notification previews never include report details.</p>
      <button type="button" className="button button--ghost button--full" onClick={enabled ? disable : enable} disabled={loading}>
        {enabled ? <><BellOff size={16} aria-hidden="true" /> Disable notifications</> : <><Bell size={16} aria-hidden="true" /> Enable notifications</>}
      </button>
      {message && <p className="muted-note" aria-live="polite">{message}</p>}
    </div>
  );
}
