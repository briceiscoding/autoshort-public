// Window lifecycle: tells the backend this window is open (heartbeat) and when it closes (beacon), so closing the
// app window stops the app. While a job runs, closing asks for confirmation (the browser shows its own dialog,
// whose text cannot be customised).
const HEARTBEAT_MS = 4000;
const client = Math.random().toString(36).slice(2, 12);
let busy = false;

const heartbeat = async () => {
	try {
		const res = await fetch(`/api/client/${client}/heartbeat`, {method: 'POST'});
		if (res.ok) busy = ((await res.json()).busy ?? []).length > 0;
	} catch {
		// Backend unreachable: nothing to protect.
		busy = false;
	}
};

export const startLifecycle = () => {
	heartbeat();
	setInterval(heartbeat, HEARTBEAT_MS);
	document.addEventListener('visibilitychange', () => {
		if (document.visibilityState === 'visible') heartbeat();
	});
	window.addEventListener('beforeunload', (e) => {
		if (!busy) return;
		e.preventDefault();
		// Legacy browsers need returnValue set to show the dialog.
		e.returnValue = 'A generation is running: closing AutoShort will stop it.';
	});
	window.addEventListener('pagehide', () => {
		navigator.sendBeacon(`/api/client/${client}/bye`);
	});
	// Back from the back/forward cache: this window is alive again.
	window.addEventListener('pageshow', (e) => {
		if (e.persisted) heartbeat();
	});
};
