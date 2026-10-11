/**
 * PetroCorp Station Management - Operator Page Controller
 */
import { supabase } from '../supabase.js';
import { fetchUserProfile, fetchStationSettings } from '../services/api.js';
import { initOperatorDashboard } from '../operator.js';
import { initThemeController } from '../utils/theme.js';

export const AppState = {
    currentUser: null,
    userProfile: null,
    userRole: 'operator',
    hasDualAccess: false,
    stationSettings: {}
};

async function init() {
    initThemeController();

    try {
        const { data: sessionData, error } = await supabase.auth.getSession();
        if (error || !sessionData?.session) {
            window.location.href = 'index.html';
            return;
        }

        const session = sessionData.session;
        const profile = await fetchUserProfile(session.user.id);

        if (!profile || profile.is_active === false) {
            await supabase.auth.signOut();
            window.location.href = 'index.html';
            return;
        }

        AppState.currentUser = session.user;
        AppState.userProfile = profile;

        // Check if user also has manager access
        const isDual = profile.role === 'manager' || profile.has_dual_access === true;
        AppState.hasDualAccess = isDual;

        if (isDual) {
            const mgrLink = document.getElementById('manager-portal-link');
            if (mgrLink) {
                mgrLink.href = 'manager.html';
                mgrLink.classList.remove('hidden');
            }
        }

        // Header User Info
        const nameEl = document.getElementById('user-name');
        if (nameEl) nameEl.textContent = profile.full_name || 'Station Operator';

        // Station info
        try {
            AppState.stationSettings = await fetchStationSettings();
            if (AppState.stationSettings.station_name) {
                const badge = document.getElementById('station-badge');
                if (badge) {
                    const code = AppState.stationSettings.station_code ? ` • ${AppState.stationSettings.station_code}` : '';
                    badge.textContent = `${AppState.stationSettings.station_name.toUpperCase()}${code}`;
                }
            }
        } catch {}

        setupAuthListeners();

        // Initialize Operator Shift Flow
        initOperatorDashboard(AppState);

    } catch (err) {
        console.error('Operator init error:', err);
        window.location.href = 'index.html';
    }
}

function setupAuthListeners() {
    document.getElementById('logout-btn')?.addEventListener('click', async () => {
        await supabase.auth.signOut();
        sessionStorage.removeItem('petrocorp-active-role');
        window.location.href = 'index.html';
    });

    supabase.auth.onAuthStateChange((event) => {
        if (event === 'SIGNED_OUT') {
            sessionStorage.removeItem('petrocorp-active-role');
            window.location.href = 'index.html';
        }
    });
}



init();
