(() => {
    const UPDATE_KEY = 'lifeuk_data_updated_at';
    const DATA_KEYS = [
        'lifeuk_srs_data',
        'lifeuk_session',
        'lifeuk_streak',
        'lifeuk_last_practice',
        'lifeuk_session_history',
        'lifeuk_daily_activity',
        'lifeuk_best_streak',
        'lifeuk_total_sessions',
        'lifeuk_theme',
        'lifeuk_source',
        UPDATE_KEY
    ];
    const SNAPSHOT_FIELDS = [
        'srs',
        'session',
        'streak',
        'lastPractice',
        'sessionHistory',
        'dailyActivity',
        'bestStreak',
        'totalSessions',
        'theme',
        'source'
    ];
    const API_URL = '/api/progress';
    const BASE_SYNC_DELAY_MS = 900;
    const RETRY_BASE_MS = 1500;
    const RETRY_MAX_MS = 30000;
    const CLEAR_ATTEMPTS = 3;

    let isApplyingRemote = false;
    let isInstrumented = false;
    let hasConnectivityListeners = false;
    let syncTimer = null;
    let retryTimer = null;
    let retryAttempt = 0;
    let isSyncing = false;
    let pendingSync = false;
    let isReconciling = false;
    let pendingReconcile = false;

    function nowIso() {
        return new Date().toISOString();
    }

    function sleep(ms) {
        return new Promise((resolve) => {
            setTimeout(resolve, ms);
        });
    }

    function getSyncIndicator() {
        return document.getElementById('sync-status');
    }

    function formatTime(value) {
        const date = value ? new Date(value) : new Date();
        if (Number.isNaN(date.getTime())) return 'just now';
        return date.toLocaleTimeString([], {
            hour: '2-digit',
            minute: '2-digit'
        });
    }

    function isOffline() {
        return typeof navigator !== 'undefined' && navigator.onLine === false;
    }

    function setSyncStatus(state, message) {
        const el = getSyncIndicator();
        if (!el) return;

        el.classList.remove('idle', 'syncing', 'success', 'error', 'offline');
        el.classList.add(state);
        if (message) {
            el.textContent = message;
            return;
        }

        const defaults = {
            idle: 'Cloud idle',
            syncing: 'Syncing...',
            success: 'Synced',
            error: 'Sync failed',
            offline: 'Offline'
        };
        el.textContent = defaults[state] || 'Cloud idle';
    }

    function getUserId() {
        if (window.lifeUkAuth && typeof window.lifeUkAuth.getUserId === 'function') {
            return window.lifeUkAuth.getUserId();
        }
        return null;
    }

    function authHeaders() {
        const headers = { 'Content-Type': 'application/json' };
        const userId = getUserId();
        if (userId) headers['X-User-Id'] = userId;
        return headers;
    }

    function getLocalSnapshot() {
        return {
            srs: localStorage.getItem('lifeuk_srs_data'),
            session: localStorage.getItem('lifeuk_session'),
            streak: localStorage.getItem('lifeuk_streak'),
            lastPractice: localStorage.getItem('lifeuk_last_practice'),
            sessionHistory: localStorage.getItem('lifeuk_session_history'),
            dailyActivity: localStorage.getItem('lifeuk_daily_activity'),
            bestStreak: localStorage.getItem('lifeuk_best_streak'),
            totalSessions: localStorage.getItem('lifeuk_total_sessions'),
            theme: localStorage.getItem('lifeuk_theme'),
            source: localStorage.getItem('lifeuk_source'),
            updatedAt: localStorage.getItem(UPDATE_KEY) || null
        };
    }

    function hasSnapshotData(snapshot) {
        return SNAPSHOT_FIELDS.some((field) => snapshot[field] !== null && snapshot[field] !== undefined);
    }

    function parseTimestamp(value) {
        const parsed = Date.parse(value || '');
        return Number.isFinite(parsed) ? parsed : 0;
    }

    function createHttpError(operation, response) {
        const error = new Error(`${operation} failed (${response.status})`);
        error.status = response.status;
        return error;
    }

    function isRetryableError(error) {
        if (!error || typeof error.status !== 'number') {
            return true;
        }
        return error.status === 429 || error.status >= 500;
    }

    function setIfPresent(key, value) {
        if (value === null || value === undefined) {
            localStorage.removeItem(key);
            return;
        }
        localStorage.setItem(key, value);
    }

    function applySnapshot(snapshot) {
        isApplyingRemote = true;
        try {
            setIfPresent('lifeuk_srs_data', snapshot.srs ?? null);
            setIfPresent('lifeuk_session', snapshot.session ?? null);
            setIfPresent('lifeuk_streak', snapshot.streak ?? null);
            setIfPresent('lifeuk_last_practice', snapshot.lastPractice ?? null);
            setIfPresent('lifeuk_session_history', snapshot.sessionHistory ?? null);
            setIfPresent('lifeuk_daily_activity', snapshot.dailyActivity ?? null);
            setIfPresent('lifeuk_best_streak', snapshot.bestStreak ?? null);
            setIfPresent('lifeuk_total_sessions', snapshot.totalSessions ?? null);
            setIfPresent('lifeuk_theme', snapshot.theme ?? null);
            setIfPresent('lifeuk_source', snapshot.source ?? null);
            setIfPresent(UPDATE_KEY, snapshot.updatedAt || nowIso());
        } finally {
            isApplyingRemote = false;
        }
    }

    function markUpdated() {
        if (isApplyingRemote) return;
        localStorage.setItem(UPDATE_KEY, nowIso());
    }

    function clearSyncTimer() {
        if (!syncTimer) return;
        clearTimeout(syncTimer);
        syncTimer = null;
    }

    function clearRetryTimer() {
        if (!retryTimer) return;
        clearTimeout(retryTimer);
        retryTimer = null;
    }

    function scheduleRetry() {
        if (retryTimer) return;

        const delay = Math.min(RETRY_BASE_MS * (2 ** retryAttempt), RETRY_MAX_MS);
        retryAttempt += 1;

        const retryText = isOffline()
            ? `Offline, retrying in ${Math.ceil(delay / 1000)}s`
            : `Sync failed, retrying in ${Math.ceil(delay / 1000)}s`;
        setSyncStatus(isOffline() ? 'offline' : 'error', retryText);

        retryTimer = setTimeout(() => {
            retryTimer = null;
            void pushSnapshot();
        }, delay);
    }

    async function pushSnapshot(options = {}) {
        const { immediate = false } = options;

        if (immediate) {
            clearSyncTimer();
        }

        pendingSync = true;
        if (isSyncing || isApplyingRemote) return true;

        while (pendingSync) {
            pendingSync = false;
            isSyncing = true;

            const snapshot = getLocalSnapshot();
            if (!snapshot.updatedAt) {
                snapshot.updatedAt = nowIso();
                localStorage.setItem(UPDATE_KEY, snapshot.updatedAt);
            }

            try {
                setSyncStatus('syncing', 'Syncing...');
                const response = await fetch(API_URL, {
                    method: 'PUT',
                    headers: authHeaders(),
                    body: JSON.stringify(snapshot)
                });
                if (!response.ok) {
                    throw createHttpError('Cloud sync push', response);
                }

                let responseJson = null;
                try {
                    responseJson = await response.json();
                } catch {
                    responseJson = null;
                }

                if (responseJson && responseJson.updatedAt && responseJson.updatedAt !== snapshot.updatedAt) {
                    localStorage.setItem(UPDATE_KEY, responseJson.updatedAt);
                }

                retryAttempt = 0;
                clearRetryTimer();
                setSyncStatus('success', `Synced ${formatTime(nowIso())}`);
            } catch (error) {
                console.warn('Cloud sync push failed:', error);
                if (isRetryableError(error)) {
                    scheduleRetry();
                } else {
                    setSyncStatus('error', 'Sync failed');
                }
                isSyncing = false;
                return false;
            }

            isSyncing = false;
        }

        return true;
    }

    function schedulePush(delayMs = BASE_SYNC_DELAY_MS) {
        if (isApplyingRemote) return;
        if (isSyncing) {
            pendingSync = true;
            return;
        }

        clearRetryTimer();
        clearSyncTimer();

        syncTimer = setTimeout(() => {
            syncTimer = null;
            void pushSnapshot();
        }, Math.max(0, delayMs));
    }

    async function fetchRemoteSnapshot() {
        const response = await fetch(API_URL, {
            headers: authHeaders()
        });

        if (response.status === 404) {
            return null;
        }

        if (!response.ok) {
            throw createHttpError('Cloud sync fetch', response);
        }

        return response.json();
    }

    function refreshAppStateFromStorage() {
        if (window.srs && typeof window.srs.loadCards === 'function') {
            window.srs.cards = window.srs.loadCards();
        }

        if (window.app && typeof window.app.loadSession === 'function') {
            window.app.currentSource = localStorage.getItem('lifeuk_source') || 'official';
            window.app.initSource();
            window.app.loadSession();
            window.app.updateStats();
            window.app.updateDueCount();
            window.app.updateFailedCount();
        }
    }

    async function reconcileOnce() {
        setSyncStatus('syncing', 'Checking cloud...');
        const local = getLocalSnapshot();
        const remote = await fetchRemoteSnapshot();

        if (!remote) {
            if (hasSnapshotData(local)) {
                await pushSnapshot({ immediate: true });
            } else {
                setSyncStatus('idle', 'Cloud ready');
            }
            return;
        }

        const localTs = parseTimestamp(local.updatedAt);
        const remoteTs = parseTimestamp(remote.updatedAt);

        if (remoteTs > localTs) {
            applySnapshot(remote);
            refreshAppStateFromStorage();
            setSyncStatus('success', `Synced ${formatTime(remote.updatedAt)}`);
            return;
        }

        if (localTs > remoteTs) {
            await pushSnapshot({ immediate: true });
            return;
        }

        const remoteHasData = hasSnapshotData(remote);
        const localHasData = hasSnapshotData(local);

        if (!localTs && !remoteTs) {
            if (!localHasData && remoteHasData) {
                applySnapshot(remote);
                refreshAppStateFromStorage();
                setSyncStatus('success', 'Synced from cloud');
                return;
            }

            if (localHasData && !remoteHasData) {
                await pushSnapshot({ immediate: true });
                return;
            }
        }

        if (local.updatedAt) {
            setSyncStatus('success', `Synced ${formatTime(local.updatedAt)}`);
        } else if (remote.updatedAt) {
            setSyncStatus('success', `Synced ${formatTime(remote.updatedAt)}`);
        } else {
            setSyncStatus('idle', 'Cloud ready');
        }
    }

    async function reconcileWithRemote() {
        pendingReconcile = true;
        if (isReconciling) return;

        while (pendingReconcile) {
            pendingReconcile = false;
            isReconciling = true;
            try {
                await reconcileOnce();
            } catch (error) {
                console.warn('Cloud sync init failed:', error);
                setSyncStatus(isOffline() ? 'offline' : 'error', 'Cloud unavailable');
            } finally {
                isReconciling = false;
            }
        }
    }

    function attachConnectivityListeners() {
        if (hasConnectivityListeners) return;
        hasConnectivityListeners = true;

        window.addEventListener('online', () => {
            setSyncStatus('syncing', 'Back online, syncing...');
            void pushSnapshot({ immediate: true });
        });

        window.addEventListener('offline', () => {
            setSyncStatus('offline', 'Offline');
        });
    }

    function instrumentLocalStorage() {
        if (isInstrumented) return;
        isInstrumented = true;

        const originalSetItem = localStorage.setItem.bind(localStorage);
        const originalRemoveItem = localStorage.removeItem.bind(localStorage);

        localStorage.setItem = function wrappedSetItem(key, value) {
            originalSetItem(key, value);
            if (isApplyingRemote || key === UPDATE_KEY || !DATA_KEYS.includes(key)) return;
            markUpdated();
            schedulePush();
        };

        localStorage.removeItem = function wrappedRemoveItem(key) {
            originalRemoveItem(key);
            if (isApplyingRemote || key === UPDATE_KEY || !DATA_KEYS.includes(key)) return;
            markUpdated();
            schedulePush();
        };
    }

    async function clearRemote() {
        clearSyncTimer();
        clearRetryTimer();
        pendingSync = false;
        retryAttempt = 0;

        setSyncStatus('syncing', 'Clearing cloud...');

        for (let attempt = 1; attempt <= CLEAR_ATTEMPTS; attempt++) {
            try {
                const response = await fetch(API_URL, {
                    method: 'DELETE',
                    headers: authHeaders()
                });
                if (!response.ok) {
                    throw createHttpError('Cloud sync clear', response);
                }

                setSyncStatus('success', 'Cloud cleared');
                return true;
            } catch (error) {
                console.warn('Cloud sync clear failed:', error);
                if (!isRetryableError(error) || attempt >= CLEAR_ATTEMPTS) {
                    setSyncStatus(isOffline() ? 'offline' : 'error', 'Cloud clear failed');
                    return false;
                }

                const delay = RETRY_BASE_MS * attempt;
                setSyncStatus(
                    isOffline() ? 'offline' : 'error',
                    `Clear failed, retrying in ${Math.ceil(delay / 1000)}s`
                );
                await sleep(delay);
            }
        }

        return false;
    }

    async function flushNow() {
        return pushSnapshot({ immediate: true });
    }

    async function init() {
        instrumentLocalStorage();
        attachConnectivityListeners();

        if (isOffline()) {
            setSyncStatus('offline', 'Offline');
        } else {
            setSyncStatus('idle', 'Cloud ready');
        }

        await reconcileWithRemote();
    }

    window.lifeUkSync = {
        init,
        pushSnapshot,
        flushNow,
        clearRemote,
        handleAuthChange: async () => {
            // User just signed in/out — reconcile, then force-push any
            // local data so guest progress migrates to the authenticated user.
            await reconcileWithRemote();
            const snap = getLocalSnapshot();
            if (hasSnapshotData(snap)) {
                await pushSnapshot({ immediate: true });
            }
        }
    };
})();
