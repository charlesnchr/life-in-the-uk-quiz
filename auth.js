(() => {
    const SUPABASE_URL = 'https://jwpanggbgjtikfieneif.supabase.co';
    const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_y4jUy4q6XuazCYaR67HoyQ_UcHiMGrl';

    let client = null;
    let currentUser = null;

    function renderAuth() {
        const statusEl = document.getElementById('auth-status');
        const signInBtn = document.getElementById('auth-signin');
        const signOutBtn = document.getElementById('auth-signout');
        if (!statusEl || !signInBtn || !signOutBtn) return;

        if (currentUser) {
            statusEl.textContent = currentUser.email || 'Signed in';
            signInBtn.classList.add('hidden');
            signOutBtn.classList.remove('hidden');
        } else {
            statusEl.textContent = 'Guest mode';
            signInBtn.classList.remove('hidden');
            signOutBtn.classList.add('hidden');
        }
    }

    async function signInWithGoogle() {
        if (!client) return;
        await client.auth.signInWithOAuth({
            provider: 'google',
            options: {
                redirectTo: `${window.location.origin}`
            }
        });
    }

    async function signOut() {
        if (!client) return;
        await client.auth.signOut();
    }

    function getUserId() {
        return currentUser ? currentUser.id : null;
    }

    async function init() {
        if (!window.supabase || !window.supabase.createClient) {
            console.warn('Supabase client library not loaded.');
            return;
        }

        client = window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
        const { data } = await client.auth.getUser();
        currentUser = data ? data.user : null;
        renderAuth();

        const signInBtn = document.getElementById('auth-signin');
        const signOutBtn = document.getElementById('auth-signout');
        if (signInBtn) signInBtn.addEventListener('click', signInWithGoogle);
        if (signOutBtn) signOutBtn.addEventListener('click', signOut);

        client.auth.onAuthStateChange((_event, session) => {
            currentUser = session ? session.user : null;
            renderAuth();
            if (window.lifeUkSync && typeof window.lifeUkSync.handleAuthChange === 'function') {
                window.lifeUkSync.handleAuthChange();
            }
        });
    }

    window.lifeUkAuth = {
        init,
        getUserId
    };
})();
