(() => {
    const DATA_KEYS = [
        'lifeuk_srs_data',
        'lifeuk_session',
        'lifeuk_streak',
        'lifeuk_last_practice',
        'lifeuk_theme',
        'lifeuk_source',
        'lifeuk_data_updated_at'
    ];
    const UPDATE_KEY = 'lifeuk_data_updated_at';
    const API_URL = '/api/progress';
    let isApplyingRemote = false;
    let syncTimer = null;

    function nowIso() {
        return new Date().toISOString();
    }

    function getLocalSnapshot() {
        return {
            srs: localStorage.getItem('lifeuk_srs_data'),
            session: localStorage.getItem('lifeuk_session'),
            streak: localStorage.getItem('lifeuk_streak'),
            lastPractice: localStorage.getItem('lifeuk_last_practice'),
            theme: localStorage.getItem('lifeuk_theme'),
            source: localStorage.getItem('lifeuk_source'),
            updatedAt: localStorage.getItem(UPDATE_KEY) || null
        };
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

    async function pushSnapshot() {
        const snapshot = getLocalSnapshot();
        if (!snapshot.updatedAt) {
            snapshot.updatedAt = nowIso();
            localStorage.setItem(UPDATE_KEY, snapshot.updatedAt);
        }

        try {
            await fetch(API_URL, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(snapshot)
            });
        } catch (error) {
            console.warn('Cloud sync push failed:', error);
        }
    }

    function schedulePush(delayMs = 900) {
        if (isApplyingRemote) return;
        if (syncTimer) clearTimeout(syncTimer);
        syncTimer = setTimeout(() => {
            syncTimer = null;
            pushSnapshot();
        }, delayMs);
    }

    function instrumentLocalStorage() {
        const originalSetItem = localStorage.setItem.bind(localStorage);
        const originalRemoveItem = localStorage.removeItem.bind(localStorage);

        localStorage.setItem = function wrappedSetItem(key, value) {
            originalSetItem(key, value);
            if (DATA_KEYS.includes(key) && key !== UPDATE_KEY) {
                markUpdated();
                schedulePush();
            }
        };

        localStorage.removeItem = function wrappedRemoveItem(key) {
            originalRemoveItem(key);
            if (DATA_KEYS.includes(key) && key !== UPDATE_KEY) {
                markUpdated();
                schedulePush();
            }
        };
    }

    async function init() {
        instrumentLocalStorage();
        markUpdated();

        try {
            const response = await fetch(API_URL);
            if (!response.ok) {
                await pushSnapshot();
                return;
            }

            const remote = await response.json();
            if (!remote || !remote.updatedAt) {
                await pushSnapshot();
                return;
            }

            const local = getLocalSnapshot();
            const localTs = local.updatedAt ? Date.parse(local.updatedAt) : 0;
            const remoteTs = Date.parse(remote.updatedAt) || 0;

            if (remoteTs > localTs) {
                applySnapshot(remote);
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
            } else {
                await pushSnapshot();
            }
        } catch (error) {
            console.warn('Cloud sync init failed:', error);
        }
    }

    window.lifeUkSync = {
        init,
        pushSnapshot
    };
})();
