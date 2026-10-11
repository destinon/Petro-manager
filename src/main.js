/**
 * PetroCorp Station Management - Login Page Controller
 */
import { loginUser, resetPassword } from './auth/auth.js';
import { supabase } from './supabase.js';
import { initThemeController } from './utils/theme.js';

// Auto-redirect if already authenticated
async function checkExistingSession() {
    try {
        const { data: { session } } = await supabase.auth.getSession();
        if (session) {
            const activeRole = sessionStorage.getItem('petrocorp-active-role');
            if (activeRole === 'manager') {
                window.location.href = 'manager.html';
            } else {
                window.location.href = 'operator.html';
            }
        }
    } catch (err) {
        console.warn('Session check notice:', err);
    }
}



// Helpers for UI state
function setElementText(id, text) {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
}

function showAlert(elId, message) {
    const el = document.getElementById(elId);
    if (!el) return;
    el.textContent = message;
    el.classList.remove('hidden');
}

function hideAlert(elId) {
    const el = document.getElementById(elId);
    if (!el) return;
    el.textContent = '';
    el.classList.add('hidden');
}

function setFieldValidity(inputEl, isValid) {
    if (!inputEl) return;
    if (!isValid) {
        inputEl.classList.add('is-invalid');
    } else {
        inputEl.classList.remove('is-invalid');
    }
}

// Handle Login Submission
async function handleLoginSubmit(e) {
    e.preventDefault();

    const emailInput = document.getElementById('email');
    const passwordInput = document.getElementById('password');
    const roleSelect = document.getElementById('login-role');
    const submitBtn = document.getElementById('login-btn');
    const btnText = submitBtn ? submitBtn.querySelector('.btn-text') : null;
    const btnSpinner = submitBtn ? submitBtn.querySelector('.btn-spinner') : null;
    const loginCard = document.querySelector('.login-card');

    hideAlert('login-error');
    hideAlert('login-success');
    setFieldValidity(emailInput, true);
    setFieldValidity(passwordInput, true);

    const email = emailInput ? emailInput.value.trim() : '';
    const password = passwordInput ? passwordInput.value : '';
    const role = roleSelect ? roleSelect.value : 'operator';

    // Client-side validations
    if (!email) {
        setFieldValidity(emailInput, false);
        showAlert('login-error', 'Please enter your work email address.');
        emailInput?.focus();
        return;
    }

    if (!password) {
        setFieldValidity(passwordInput, false);
        showAlert('login-error', 'Please enter your password.');
        passwordInput?.focus();
        return;
    }

    // Set Loading State
    if (submitBtn) submitBtn.disabled = true;
    if (btnText) btnText.textContent = 'Verifying Credentials...';
    if (btnSpinner) btnSpinner.classList.remove('hidden');

    try {
        const result = await loginUser(email, password, role);
        const destination = result.profile.role === 'manager' ? 'manager.html' : 'operator.html';
        const roleLabel = result.profile.role === 'manager' ? 'Manager Workstation' : 'Operator Terminal';
        
        showAlert('login-success', `Welcome, ${result.profile.full_name || 'User'}! Launching ${roleLabel}...`);
        
        setTimeout(() => {
            window.location.href = destination;
        }, 500);
    } catch (err) {
        console.error('Login Failed:', err);

        // Shake animation
        if (loginCard) {
            loginCard.classList.remove('shake-anim');
            void loginCard.offsetWidth; // trigger reflow
            loginCard.classList.add('shake-anim');
        }

        setFieldValidity(emailInput, false);
        setFieldValidity(passwordInput, false);
        showAlert('login-error', err.message || 'Authentication failed. Please verify credentials.');
    } finally {
        if (submitBtn) submitBtn.disabled = false;
        if (btnText) btnText.textContent = 'Authenticate & Sign In';
        if (btnSpinner) btnSpinner.classList.add('hidden');
    }
}

// Handle Password Recovery
async function handleResetSubmit(e) {
    e.preventDefault();

    const resetEmailInput = document.getElementById('reset-email');
    const sendBtn = document.getElementById('send-reset-btn');
    const email = resetEmailInput ? resetEmailInput.value.trim() : '';

    hideAlert('reset-error');
    hideAlert('reset-success');
    setFieldValidity(resetEmailInput, true);

    if (!email) {
        setFieldValidity(resetEmailInput, false);
        showAlert('reset-error', 'Please enter your registered email address.');
        resetEmailInput?.focus();
        return;
    }

    if (sendBtn) {
        sendBtn.disabled = true;
        sendBtn.textContent = 'Sending...';
    }

    try {
        await resetPassword(email);
        showAlert('reset-success', 'Password reset instructions have been emailed to you. Check your inbox.');
        if (resetEmailInput) resetEmailInput.value = '';
    } catch (err) {
        setFieldValidity(resetEmailInput, false);
        showAlert('reset-error', err.message || 'Unable to send reset email. Verify the address is correct.');
    } finally {
        if (sendBtn) {
            sendBtn.disabled = false;
            sendBtn.textContent = 'Send Recovery Link';
        }
    }
}

// Toggle between Login and Password Reset
function setupViewToggles() {
    const loginForm = document.getElementById('login-form');
    const resetView = document.getElementById('reset-password-view');
    const forgotLink = document.getElementById('forgot-password-link');
    const cancelResetBtn = document.getElementById('cancel-reset-btn');

    if (forgotLink) {
        forgotLink.addEventListener('click', (e) => {
            e.preventDefault();
            hideAlert('login-error');
            hideAlert('login-success');
            loginForm?.classList.add('hidden');
            resetView?.classList.remove('hidden');
            document.getElementById('reset-email')?.focus();
        });
    }

    if (cancelResetBtn) {
        cancelResetBtn.addEventListener('click', () => {
            hideAlert('reset-error');
            hideAlert('reset-success');
            resetView?.classList.add('hidden');
            loginForm?.classList.remove('hidden');
        });
    }
}

// Initialize Theme Controller
initThemeController();
checkExistingSession();
setupViewToggles();

const loginForm = document.getElementById('login-form');
if (loginForm) {
    loginForm.addEventListener('submit', handleLoginSubmit);
}

const resetForm = document.getElementById('reset-form');
if (resetForm) {
    resetForm.addEventListener('submit', handleResetSubmit);
}

