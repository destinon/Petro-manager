/**
 * PetroCorp Station Management - Authentication & Session Service
 */
import { supabase } from '../supabase.js';
import { fetchUserProfile } from '../services/api.js';

export async function loginUser(email, password, selectedRole) {
    const cleanEmail = email.trim();
    if (!cleanEmail || !password) {
        throw new Error('Please enter both email and password.');
    }

    const { data, error } = await supabase.auth.signInWithPassword({
        email: cleanEmail,
        password
    });

    if (error) {
        let msg = error.message;
        if (msg.includes('Invalid login credentials')) {
            msg = 'Incorrect email or password. Please verify and try again.';
        } else if (msg.includes('Email not confirmed')) {
            msg = 'Your email address is not confirmed. Please check your inbox.';
        } else if (msg.includes('fetch') || msg.includes('network')) {
            msg = 'Network connection failed. Please check your internet connection.';
        }
        throw new Error(msg);
    }

    if (!data.user) {
        throw new Error('No user record returned from authentication.');
    }

    const profile = await fetchUserProfile(data.user.id);
    if (!profile) {
        await supabase.auth.signOut();
        throw new Error('Account verified, but profile was not found. Please contact your station administrator.');
    }

    if (profile.is_active === false) {
        await supabase.auth.signOut();
        throw new Error('Your user account has been deactivated. Please contact your manager.');
    }

    const isManager = profile.role === 'manager' || profile.has_dual_access === true;

    if (isManager) {
        // Station Managers hold dual operational authorization
        profile.role = selectedRole || profile.role || 'manager';
        profile.hasDualAccess = true;
        sessionStorage.setItem('petrocorp-active-role', profile.role);
    } else if (selectedRole === 'manager') {
        await supabase.auth.signOut();
        throw new Error('Access restricted: Operator accounts do not have permission to access the Manager Console.');
    } else {
        sessionStorage.setItem('petrocorp-active-role', profile.role);
    }

    return { user: data.user, session: data.session, profile };
}

export async function resetPassword(email) {
    const cleanEmail = email.trim();
    if (!cleanEmail) throw new Error('Please enter your email address.');

    const { error } = await supabase.auth.resetPasswordForEmail(cleanEmail, {
        redirectTo: window.location.origin + '/index.html'
    });

    if (error) throw error;
    return true;
}

export async function logoutUser() {
    await supabase.auth.signOut();
    localStorage.removeItem('petrocorp-active-shift');
    sessionStorage.removeItem('petrocorp-active-role');
    window.location.href = 'index.html';
}



export async function getCurrentSession() {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return null;

    const profile = await fetchUserProfile(session.user.id);
    return {
        session,
        user: session.user,
        profile
    };
}

export async function requireAuth(expectedRole = null) {
    const authData = await getCurrentSession();
    if (!authData || !authData.session) {
        window.location.href = 'index.html';
        return null;
    }

    if (expectedRole && authData.profile && authData.profile.role !== expectedRole) {
        // Redirect to appropriate view or notify
        console.warn(`Role mismatch: Expected ${expectedRole}, got ${authData.profile.role}`);
    }

    return authData;
}
