// Window lifecycle: tells the backend this window is open (heartbeat) and when it closes (beacon), so closing the
// app window stops the app. While a job runs, closing asks for confirmation (the browser shows its own dialog,
// whose text cannot be customised).
const HEARTBEAT_MS = 4000;
const client = Math.random().toString(36).slice(2, 12);
let busy = false;

let failures = 0;

// The backend stopped (the app was closed elsewhere, or it crashed): say so instead of a page that silently does nothing.
const BANNER_ID = 'autoshort-stopped';
const showStopped = (stopped: boolean) => {
	const existing = document.getElementById(BANNER_ID);
	if (!stopped) {
		existing?.remove();
		return;
	}
	if (existing) return;
	const banner = document.createElement('div');
	banner.id = BANNER_ID;
	banner.setAttribute('role', 'alert');
	banner.textContent = 'AutoShort is stopped: nothing can be saved or changed here. Close this window, then open AutoShort again (desktop icon).';
	Object.assign(banner.style, {
		position: 'fixed', top: '0', left: '0', right: '0', zIndex: '1000', padding: '10px 16px', textAlign: 'center',
		background: '#c62828', color: '#fff', font: '600 14px system-ui, sans-serif', boxShadow: '0 2px 8px rgba(0,0,0,.25)',
	});
	document.body.appendChild(banner);
};

const heartbeat = async () => {
	try {
		const res = await fetch(`/api/client/${client}/heartbeat`, {method: 'POST'});
		if (!res.ok) throw new Error(String(res.status));
		busy = ((await res.json()).busy ?? []).length > 0;
		failures = 0;
		showStopped(false);
	} catch {
		// Backend unreachable: nothing to protect. Twice in a row (8 s): it is stopped, not restarting.
		busy = false;
		failures += 1;
		if (failures >= 2) showStopped(true);
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
