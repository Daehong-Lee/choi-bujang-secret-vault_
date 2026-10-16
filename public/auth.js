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

function validAuthConfig() {
  if (typeof SUPABASE_URL !== 'string' || typeof SUPABASE_PUBLISHABLE_KEY !== 'string') return false;
  if (!SUPABASE_URL.trim() || !SUPABASE_PUBLISHABLE_KEY.trim()) return false;
  // Square brackets in setup examples are placeholders, not part of the values.
  if (SUPABASE_URL !== SUPABASE_URL.trim() || SUPABASE_URL.startsWith('[') || SUPABASE_URL.endsWith(']')) return false;
  if (SUPABASE_PUBLISHABLE_KEY !== SUPABASE_PUBLISHABLE_KEY.trim()
      || SUPABASE_PUBLISHABLE_KEY.startsWith('[') || SUPABASE_PUBLISHABLE_KEY.endsWith(']')) return false;
  try {
    const url = new URL(SUPABASE_URL);
    return url.protocol === 'https:' && Boolean(url.hostname) && !url.username && !url.password;
  } catch {
    return false;
  }
}

if (!validAuthConfig()) {
  renderAuth(null);
  showMessage('Supabase 설정 오류: public/auth-config.js의 URL과 Publishable Key를 대괄호 없이 입력하세요.', true);
} else {
  try {
    supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false } });
  } catch {
    renderAuth(null);
    showMessage('Supabase 설정을 읽지 못했습니다. public/auth-config.js의 Project URL과 Publishable Key를 확인하세요.', true);
  }

  if (supabase) {
    loginForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      loginButton.disabled = true;
      showMessage('로그인 중입니다.');
      try {
        const { error } = await supabase.auth.signInWithPassword({
          email: emailInput.value.trim(),
          password: passwordInput.value
        });
        if (error) {
          showMessage(`로그인 실패: ${error.message}`, true);
          return;
        }
        passwordInput.value = '';
        showMessage('로그인되었습니다.');
      } catch {
        showMessage('로그인 요청을 완료하지 못했습니다. 네트워크와 Supabase 설정을 확인하세요.', true);
      } finally {
        loginButton.disabled = false;
      }
    });

    logoutButton.addEventListener('click', async () => {
      logoutButton.disabled = true;
      showMessage('로그아웃 중입니다.');
      try {
        const { error } = await supabase.auth.signOut({ scope: 'local' });
        if (error) {
          showMessage(`로그아웃 실패: ${error.message}`, true);
          return;
        }
        showMessage('로그아웃되었습니다.');
      } catch {
        showMessage('로그아웃 요청을 완료하지 못했습니다.', true);
      } finally {
        logoutButton.disabled = false;
      }
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
}
