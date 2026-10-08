import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.117.2/+esm';
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from './auth-config.js';

const loginForm = document.getElementById('login-form');
const emailInput = document.getElementById('login-email');
const passwordInput = document.getElementById('login-password');
const loginButton = document.getElementById('login-button');
const logoutButton = document.getElementById('logout-button');
const authStatus = document.getElementById('auth-status');
const authMessage = document.getElementById('auth-message');

let supabase;

function showMessage(message, isError = false) {
  authMessage.textContent = message;
  authMessage.dataset.error = isError ? 'true' : 'false';
}

function renderAuth(user) {
  const loggedIn = Boolean(user);
  loginForm.hidden = loggedIn;
  logoutButton.hidden = !loggedIn;
  authStatus.textContent = loggedIn
    ? `로그인됨: ${user.email ?? '이메일 확인 불가'}`
    : '로그인하지 않았습니다.';
}

if (!SUPABASE_URL || SUPABASE_URL === '[ ]' || !SUPABASE_PUBLISHABLE_KEY || SUPABASE_PUBLISHABLE_KEY === '[ ]') {
  renderAuth(null);
  showMessage('Supabase Project URL과 Publishable Key를 public/auth-config.js에 입력해 주세요.', true);
} else {
  supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);

  loginForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    loginButton.disabled = true;
    showMessage('로그인 중입니다.');

    const { error } = await supabase.auth.signInWithPassword({
      email: emailInput.value.trim(),
      password: passwordInput.value
    });

    loginButton.disabled = false;

    if (error) {
      showMessage(`로그인 실패: ${error.message}`, true);
      return;
    }

    passwordInput.value = '';
    showMessage('로그인되었습니다.');
  });

  logoutButton.addEventListener('click', async () => {
    logoutButton.disabled = true;
    showMessage('로그아웃 중입니다.');

    const { error } = await supabase.auth.signOut({ scope: 'local' });

    logoutButton.disabled = false;

    if (error) {
      showMessage(`로그아웃 실패: ${error.message}`, true);
      return;
    }

    showMessage('로그아웃되었습니다.');
  });

  supabase.auth.onAuthStateChange((_event, session) => {
    renderAuth(session?.user ?? null);
  });

  const { data, error } = await supabase.auth.getSession();
  if (error) {
    renderAuth(null);
    showMessage(`로그인 상태를 확인하지 못했습니다: ${error.message}`, true);
  } else {
    renderAuth(data.session?.user ?? null);
  }
}
