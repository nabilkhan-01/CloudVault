const $ = (id) => document.getElementById(id);

async function api(url, options = {}) {
  const response = await fetch(url, options);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'Request failed');
  return data;
}

function setLoggedIn(loggedIn) {
  $('loginCard').classList.toggle('hidden', loggedIn);
  $('appCard').classList.toggle('hidden', !loggedIn);
  $('logoutBtn').classList.toggle('hidden', !loggedIn);
}

async function loadFiles() {
  const { files } = await api('/api/files');
  const container = $('files');

  if (!files.length) {
    container.innerHTML = '<p class="message">No files uploaded yet.</p>';
    return;
  }

  container.innerHTML = files.map((file) => `
    <div class="file-row">
      <div class="file-name"><strong>${escapeHtml(file.key)}</strong><br><small>${formatBytes(file.size)} • ${file.lastModified ? new Date(file.lastModified).toLocaleString() : ''}</small></div>
      <div class="file-actions">
        <button data-download="${encodeURIComponent(file.key)}">Download</button>
        <button class="secondary" data-delete="${encodeURIComponent(file.key)}">Delete</button>
      </div>
    </div>
  `).join('');
}

async function loadHealth() {
  try {
    const data = await api('/api/health');
    $('health').textContent = `Connected to S3 bucket: ${data.storage.bucket} (${data.storage.region})`;
  } catch (error) {
    $('health').textContent = `AWS connection unavailable: ${error.message}`;
  }
}

$('loginForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  $('loginMessage').textContent = 'Signing in…';
  try {
    await api('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: $('username').value, password: $('password').value }),
    });
    setLoggedIn(true);
    await Promise.all([loadFiles(), loadHealth()]);
  } catch (error) {
    $('loginMessage').textContent = error.message;
  }
});

$('logoutBtn').addEventListener('click', async () => {
  await api('/api/logout', { method: 'POST' });
  setLoggedIn(false);
});

$('refreshBtn').addEventListener('click', loadFiles);

$('uploadForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  const file = $('file').files[0];
  if (!file) return;

  const body = new FormData();
  body.append('file', file);
  $('uploadMessage').textContent = 'Uploading…';

  try {
    await api('/api/files', { method: 'POST', body });
    $('uploadForm').reset();
    $('uploadMessage').textContent = 'Upload completed.';
    await loadFiles();
  } catch (error) {
    $('uploadMessage').textContent = error.message;
  }
});

$('files').addEventListener('click', async (event) => {
  const downloadKey = event.target.dataset.download;
  const deleteKey = event.target.dataset.delete;

  if (downloadKey) {
    const { url } = await api(`/api/files/download?key=${downloadKey}`);
    window.open(url, '_blank', 'noopener');
  }

  if (deleteKey) {
    if (!confirm('Delete this file from S3?')) return;
    await api(`/api/files?key=${deleteKey}`, { method: 'DELETE' });
    await loadFiles();
  }
});

async function bootstrap() {
  try {
    const session = await api('/api/session');
    setLoggedIn(session.authenticated);
    if (session.authenticated) await Promise.all([loadFiles(), loadHealth()]);
  } catch {
    setLoggedIn(false);
  }
}

function formatBytes(bytes) {
  if (!bytes) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(i ? 1 : 0)} ${units[i]}`;
}

function escapeHtml(value) {
  return value.replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]));
}

bootstrap();
