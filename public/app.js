const state = {
  user: null,
  projects: [],
  contents: [],
  currentContentId: null,
  generationInput: null,
  authMode: 'login',
  toastTimer: null,
};

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

function showToast(message, isError = false) {
  const toast = $('#toast');
  toast.textContent = message;
  toast.classList.toggle('error-toast', isError);
  toast.classList.add('visible');
  clearTimeout(state.toastTimer);
  state.toastTimer = setTimeout(() => toast.classList.remove('visible'), 3800);
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    credentials: 'same-origin',
    ...options,
    headers: {
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...options.headers,
    },
  });
  if (response.status === 204) return null;
  const contentType = response.headers.get('content-type') || '';
  const payload = contentType.includes('application/json')
    ? await response.json()
    : await response.text();
  if (!response.ok) {
    const message =
      typeof payload === 'object' && payload
        ? Array.isArray(payload.message)
          ? payload.message.join(' ')
          : payload.message
        : payload;
    const error = new Error(message || `Erreur ${response.status}`);
    error.status = response.status;
    error.details = payload;
    throw error;
  }
  return payload;
}

function jsonBody(value) {
  return { method: 'POST', body: JSON.stringify(value) };
}

function setAuthMessage(message, isError = false) {
  const el = $('#auth-message');
  el.textContent = message || '';
  el.classList.toggle('error', isError);
}

function renderAuth(mode = 'login', message = '') {
  state.authMode = mode;
  $$('.auth-tab').forEach((tab) => {
    tab.classList.toggle('active', tab.dataset.authTab === mode);
    tab.setAttribute('aria-selected', String(tab.dataset.authTab === mode));
  });
  const container = $('#auth-form-container');

  if (mode === 'signup') {
    container.innerHTML = `
      <h2>Un espace à votre image.</h2>
      <p class="auth-intro">Créez un compte pour garder vos projets et vos idées bien au chaud.</p>
      <form id="signup-form" class="auth-form">
        <label class="field-label">Adresse e-mail<input name="email" type="email" autocomplete="email" required maxlength="254" placeholder="vous@exemple.com"></label>
        <label class="field-label">Mot de passe<input name="password" type="password" autocomplete="new-password" required minlength="12" maxlength="128" placeholder="12 caractères minimum"></label>
        <span class="fine-print" style="text-align:left">12 à 128 caractères, avec une minuscule, une majuscule et un chiffre.</span>
        <button class="button button-dark button-wide" type="submit">Créer mon espace ↗</button>
      </form>`;
    $('#signup-form').addEventListener('submit', submitSignup);
  } else if (mode === 'verify') {
    container.innerHTML = `
      <h2>Confirmez votre adresse.</h2>
      <p class="auth-intro">Saisissez le jeton reçu par e-mail pour vérifier votre compte et ouvrir votre session.</p>
      <form id="verify-form" class="auth-form">
        <label class="field-label">Jeton de vérification<input name="token" autocomplete="one-time-code" required minlength="32" maxlength="200" placeholder="Collez votre jeton ici"></label>
        <button class="button button-dark button-wide" type="submit">Vérifier mon adresse ↗</button>
      </form>
      <p class="auth-switch"><button class="auth-link" data-auth-action="login">Retour à la connexion</button></p>`;
    $('#verify-form').addEventListener('submit', submitVerification);
    $("[data-auth-action='login']", container).addEventListener('click', () =>
      renderAuth('login'),
    );
  } else if (mode === 'forgot') {
    container.innerHTML = `
      <h2>Retrouvons le fil.</h2>
      <p class="auth-intro">Indiquez votre adresse. Si elle est associée à un compte, vous recevrez un lien de réinitialisation.</p>
      <form id="forgot-form" class="auth-form">
        <label class="field-label">Adresse e-mail<input name="email" type="email" autocomplete="email" required maxlength="254" placeholder="vous@exemple.com"></label>
        <button class="button button-dark button-wide" type="submit">Envoyer les instructions ↗</button>
      </form>
      <p class="auth-switch"><button class="auth-link" data-auth-action="login">Retour à la connexion</button></p>`;
    $('#forgot-form').addEventListener('submit', submitForgotPassword);
    $("[data-auth-action='login']", container).addEventListener('click', () =>
      renderAuth('login'),
    );
  } else if (mode === 'reset') {
    container.innerHTML = `
      <h2>Un nouveau départ.</h2>
      <p class="auth-intro">Collez le jeton reçu et choisissez un nouveau mot de passe.</p>
      <form id="reset-form" class="auth-form">
        <label class="field-label">Jeton de réinitialisation<input name="token" required minlength="32" maxlength="200" placeholder="Votre jeton e-mail"></label>
        <label class="field-label">Nouveau mot de passe<input name="password" type="password" autocomplete="new-password" required minlength="12" maxlength="128" placeholder="12 caractères minimum"></label>
        <button class="button button-dark button-wide" type="submit">Réinitialiser mon mot de passe ↗</button>
      </form>
      <p class="auth-switch"><button class="auth-link" data-auth-action="login">Retour à la connexion</button></p>`;
    $('#reset-form').addEventListener('submit', submitResetPassword);
    $("[data-auth-action='login']", container).addEventListener('click', () =>
      renderAuth('login'),
    );
  } else {
    container.innerHTML = `
      <h2>Ravi de vous retrouver.</h2>
      <p class="auth-intro">Reconnectez-vous à votre espace créatif.</p>
      <form id="login-form" class="auth-form">
        <label class="field-label">Adresse e-mail<input name="email" type="email" autocomplete="email" required maxlength="254" placeholder="vous@exemple.com"></label>
        <label class="field-label">Mot de passe<input name="password" type="password" autocomplete="current-password" required maxlength="128" placeholder="Votre mot de passe"></label>
        <div class="auth-inline"><button class="auth-link" type="button" data-auth-action="forgot">Mot de passe oublié ?</button></div>
        <button class="button button-dark button-wide" type="submit">Entrer dans mon studio ↗</button>
      </form>
      <p class="auth-switch">Pas encore de compte ? <button class="auth-link" data-auth-action="signup">Créer mon espace</button></p>`;
    $('#login-form').addEventListener('submit', submitLogin);
    $("[data-auth-action='forgot']", container).addEventListener('click', () =>
      renderAuth('forgot'),
    );
    $("[data-auth-action='signup']", container).addEventListener('click', () =>
      renderAuth('signup'),
    );
  }
  setAuthMessage(message);
}

function formValues(form) {
  return Object.fromEntries(new FormData(form).entries());
}

async function submitLogin(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const button = $("button[type='submit']", form);
  button.disabled = true;
  try {
    const result = await api('/auth/login', jsonBody(formValues(form)));
    await enterApp(result.user);
  } catch (error) {
    setAuthMessage(error.message, true);
  } finally {
    button.disabled = false;
  }
}

async function submitSignup(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const button = $("button[type='submit']", form);
  button.disabled = true;
  try {
    const result = await api('/auth/signup', jsonBody(formValues(form)));
    renderAuth('verify', result.message);
  } catch (error) {
    setAuthMessage(error.message, true);
  } finally {
    button.disabled = false;
  }
}

async function submitVerification(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const button = $("button[type='submit']", form);
  button.disabled = true;
  try {
    const result = await api('/auth/verify-email', jsonBody(formValues(form)));
    window.history.replaceState({}, '', '/');
    await enterApp(result.user);
  } catch (error) {
    setAuthMessage(error.message, true);
  } finally {
    button.disabled = false;
  }
}

async function submitForgotPassword(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const button = $("button[type='submit']", form);
  button.disabled = true;
  try {
    const result = await api(
      '/auth/forgot-password',
      jsonBody(formValues(form)),
    );
    setAuthMessage(result.message);
  } catch (error) {
    setAuthMessage(error.message, true);
  } finally {
    button.disabled = false;
  }
}

async function submitResetPassword(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const button = $("button[type='submit']", form);
  button.disabled = true;
  try {
    const result = await api(
      '/auth/reset-password',
      jsonBody(formValues(form)),
    );
    renderAuth('login', result.message);
    window.history.replaceState({}, '', '/');
  } catch (error) {
    setAuthMessage(error.message, true);
  } finally {
    button.disabled = false;
  }
}

async function enterApp(user) {
  state.user = user;
  $('#auth-view').classList.add('hidden');
  $('#app-view').classList.remove('hidden');
  $('#user-email').textContent = user.email;
  $('#user-avatar').textContent = user.email.slice(0, 1);
  $('#today-label').textContent = new Intl.DateTimeFormat('fr-FR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(new Date());
  $('#welcome-name').textContent = user.email.split('@')[0];
  await Promise.all([
    loadQuota(),
    loadProjects(),
    loadProfile(),
    loadLibrary(),
  ]);
  navigate('home');
}

async function signOut() {
  try {
    await api('/auth/logout', { method: 'POST' });
  } catch {
    // The local view is cleared even if the session has already expired.
  }
  state.user = null;
  state.contents = [];
  $('#app-view').classList.add('hidden');
  $('#auth-view').classList.remove('hidden');
  renderAuth('login', 'Vous êtes déconnecté.');
}

const pageNames = {
  home: 'Vue d’ensemble',
  create: 'Créer un contenu',
  library: 'Bibliothèque',
  calendar: 'Calendrier',
  brand: 'Ma marque',
  settings: 'Paramètres',
};

async function navigate(page) {
  if (!pageNames[page]) return;
  $$('.page-section').forEach((section) => section.classList.add('hidden'));
  $(`#page-${page}`).classList.remove('hidden');
  $$('#app-view [data-page]').forEach((button) => {
    button.classList.toggle('active', button.dataset.page === page);
  });
  $('#page-title').textContent = pageNames[page];
  if (page === 'calendar') await loadCalendar();
  if (page === 'library') await loadLibrary();
  if (page === 'home') await loadDashboard();
  if (page === 'brand') {
    await Promise.all([loadProfile(), loadProjects()]);
  }
  if (page === 'settings') await loadSubscription();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

async function loadQuota() {
  try {
    const quota = await api('/quota');
    const remaining = Math.max(0, Number(quota.remaining) || 0);
    const limit = Math.max(1, Number(quota.limit) || 1);
    $('#sidebar-quota').textContent = `${remaining} / ${limit}`;
    $('#quota-progress').style.width =
      `${Math.min(100, (quota.used / limit) * 100)}%`;
    $('#stat-quota').textContent = remaining;
  } catch (error) {
    if (error.status !== 401) showToast(error.message, true);
  }
}

async function loadProjects() {
  try {
    state.projects = await api('/projects');
    const projectSelects = ['#generation-project', '#filter-project'];
    projectSelects.forEach((selector) => {
      const select = $(selector);
      const selected = select.value;
      const firstOption =
        selector === '#generation-project' ? 'Sans projet' : 'Tous les projets';
      select.replaceChildren(new Option(firstOption, ''));
      state.projects.forEach((project) =>
        select.add(new Option(project.name, project.id)),
      );
      select.value = state.projects.some((project) => project.id === selected)
        ? selected
        : '';
    });
    renderProjects();
  } catch (error) {
    if (error.status !== 401) showToast(error.message, true);
  }
}

async function loadProfile() {
  try {
    const profile = await api('/profile');
    const form = $('#brand-form');
    if (profile) {
      for (const [key, value] of Object.entries(profile)) {
        if (form.elements.namedItem(key))
          form.elements.namedItem(key).value = value ?? '';
      }
      $('#welcome-name').textContent =
        profile.brandName || state.user.email.split('@')[0];
    } else {
      form.reset();
    }
  } catch (error) {
    if (error.status !== 401) showToast(error.message, true);
  }
}

async function loadLibrary(filters = {}) {
  const params = new URLSearchParams();
  const values = {
    projectId: $('#filter-project').value,
    status: $('#filter-status').value,
    platform: $('#filter-platform').value,
  };
  for (const [key, value] of Object.entries(values))
    if (value) params.set(key, value);
  const from = $('#filter-from').value;
  const to = $('#filter-to').value;
  if (from) params.set('from', new Date(`${from}T00:00:00.000Z`).toISOString());
  if (to) params.set('to', new Date(`${to}T23:59:59.999Z`).toISOString());
  Object.entries(filters).forEach(([key, value]) => {
    if (value) params.set(key, value);
  });
  try {
    state.contents = await api(`/content${params.size ? `?${params}` : ''}`);
    renderContentList(state.contents, $('#library-content'));
    $('#library-count').textContent =
      `${state.contents.length} ${state.contents.length === 1 ? 'contenu retrouvé' : 'contenus retrouvés'} · 200 maximum`;
    $('#library-empty').classList.toggle('hidden', state.contents.length > 0);
  } catch (error) {
    if (error.status !== 401) showToast(error.message, true);
  }
}

async function loadDashboard() {
  try {
    const contents = await api('/content');
    const scheduled = contents.filter((item) => item.status === 'scheduled');
    $('#stat-content').textContent = contents.length;
    $('#stat-scheduled').textContent = scheduled.length;
    const recent = contents.slice(0, 3);
    renderContentList(recent, $('#recent-content'), false);
    $('#home-empty').classList.toggle('hidden', contents.length > 0);
    $('#recent-content').classList.toggle('hidden', contents.length === 0);
    await loadQuota();
  } catch (error) {
    if (error.status !== 401) showToast(error.message, true);
  }
}

async function loadCalendar() {
  const fromControl = $('#calendar-from');
  const toControl = $('#calendar-to');
  if (!fromControl.value || !toControl.value) {
    const now = new Date();
    const first = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1),
    );
    const last = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0),
    );
    fromControl.value = first.toISOString().slice(0, 10);
    toControl.value = last.toISOString().slice(0, 10);
  }
  const from = new Date(`${fromControl.value}T00:00:00.000Z`).toISOString();
  const to = new Date(`${toControl.value}T23:59:59.999Z`).toISOString();
  try {
    const contents = await api(
      `/calendar?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
    );
    renderContentList(contents, $('#calendar-content'));
    $('#calendar-empty').classList.toggle('hidden', contents.length > 0);
  } catch (error) {
    if (error.status !== 401) showToast(error.message, true);
  }
}

function formatDate(value) {
  if (!value) return 'Sans date';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Sans date';
  return new Intl.DateTimeFormat('fr-FR', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(date);
}

const statusNames = {
  draft: 'Brouillon',
  scheduled: 'Planifié',
  published: 'Publié',
  archived: 'Archivé',
};

function renderContentList(contents, container, withActions = true) {
  container.replaceChildren();
  contents.forEach((content) => {
    const card = document.createElement('article');
    card.className = 'content-card';
    const top = document.createElement('div');
    top.className = 'content-card-top';
    const format = document.createElement('span');
    format.className = 'format-tag';
    format.textContent = content.format;
    const status = document.createElement('span');
    status.className = `status-tag ${content.status}`;
    status.textContent = statusNames[content.status] || content.status;
    top.append(format, status);
    const heading = document.createElement('h3');
    heading.textContent = content.subject;
    const excerpt = document.createElement('p');
    excerpt.className = 'content-card-excerpt';
    excerpt.textContent = content.hook || content.script;
    const meta = document.createElement('div');
    meta.className = 'content-card-meta';
    meta.textContent = `${content.targetPlatform || 'Sans plateforme'} · ${formatDate(content.scheduledAt || content.createdAt)}`;
    card.append(top, heading, excerpt, meta);
    if (withActions) {
      const actions = document.createElement('div');
      actions.className = 'content-card-actions';
      const edit = document.createElement('button');
      edit.className = 'card-action';
      edit.type = 'button';
      edit.textContent = 'Modifier';
      edit.addEventListener('click', () => openContentEditor(content));
      const remove = document.createElement('button');
      remove.className = 'card-action delete';
      remove.type = 'button';
      remove.textContent = 'Supprimer';
      remove.addEventListener('click', () => deleteContent(content.id));
      actions.append(edit, remove);
      card.append(actions);
    }
    container.append(card);
  });
}

async function submitGeneration(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const values = formValues(form);
  state.generationInput = values;
  await generateContent(values);
}

async function generateContent(values = state.generationInput) {
  if (!values) return;
  $('#result-placeholder').classList.add('hidden');
  $('#result-editor').classList.add('hidden');
  $('#result-error').classList.add('hidden');
  $('#result-loading').classList.remove('hidden');
  const button = $('#generate-button');
  button.disabled = true;
  try {
    const result = await api('/content/generate', jsonBody(values));
    state.currentContentId = null;
    fillEditor(result.content, values.projectId || null);
    showToast('Votre contenu est prêt à être retravaillé.');
    await loadQuota();
  } catch (error) {
    $('#result-loading').classList.add('hidden');
    const errorBox = $('#result-error');
    errorBox.replaceChildren();
    const message = document.createElement('p');
    message.textContent = error.message;
    errorBox.append(message);
    if (error.status === 429) {
      const upgrade = document.createElement('button');
      upgrade.type = 'button';
      upgrade.className = 'button button-light';
      upgrade.textContent = 'Découvrir les offres';
      upgrade.addEventListener('click', startCheckout);
      errorBox.append(upgrade);
    } else {
      const retry = document.createElement('button');
      retry.type = 'button';
      retry.className = 'button button-light';
      retry.textContent = 'Réessayer';
      retry.addEventListener('click', () => generateContent(values));
      errorBox.append(retry);
    }
    errorBox.classList.remove('hidden');
  } finally {
    button.disabled = false;
  }
}

function fillEditor(content, projectId = null) {
  $('#result-hook').value = content.hook || '';
  $('#result-script').value = content.script || '';
  $('#result-cta').value = content.cta || '';
  $('#result-format').textContent = content.format || 'contenu';
  $('#generation-subject').value = content.subject || '';
  const formatSelect = $('#generation-format');
  if (
    content.format &&
    ![...formatSelect.options].some((option) => option.value === content.format)
  ) {
    formatSelect.add(new Option(content.format, content.format));
  }
  formatSelect.value = content.format || '';
  if (projectId) $('#generation-project').value = projectId;
  renderCaptions(content.captions || ['']);
  $('#schedule-fields').classList.add('hidden');
  $('#schedule-toggle').textContent = '＋ Planifier';
  $('#result-placeholder').classList.add('hidden');
  $('#result-loading').classList.add('hidden');
  $('#result-error').classList.add('hidden');
  $('#result-editor').classList.remove('hidden');
  $('#save-content').textContent = 'Sauvegarder le brouillon ↗';
  $('#editor-status').textContent = '';
}

function renderCaptions(captions) {
  const container = $('#caption-fields');
  container.replaceChildren();
  captions.forEach((caption, index) => {
    const row = document.createElement('div');
    row.className = 'caption-row';
    const textarea = document.createElement('textarea');
    textarea.rows = 2;
    textarea.maxLength = 2000;
    textarea.required = true;
    textarea.setAttribute('aria-label', `Suggestion de caption ${index + 1}`);
    textarea.value = caption;
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'remove-caption';
    remove.setAttribute('aria-label', 'Supprimer cette caption');
    remove.textContent = '×';
    remove.addEventListener('click', () => {
      if (container.querySelectorAll('.caption-row').length <= 1) {
        showToast('Gardez au moins une caption.', true);
        return;
      }
      row.remove();
    });
    row.append(textarea, remove);
    container.append(row);
  });
  if (captions.length < 5) {
    const add = document.createElement('button');
    add.type = 'button';
    add.className = 'add-caption';
    add.textContent = '＋ Ajouter une caption';
    add.addEventListener('click', () => {
      const current = $$('#caption-fields textarea').map(
        (input) => input.value,
      );
      current.push('');
      renderCaptions(current);
      $('#caption-fields textarea:last-of-type').focus();
    });
    container.append(add);
  }
}

function openContentEditor(content) {
  navigate('create');
  state.currentContentId = content.id;
  fillEditor(content, content.projectId);
  if (content.targetPlatform)
    $('#result-platform').value = content.targetPlatform;
  if (content.scheduledAt) {
    $('#schedule-fields').classList.remove('hidden');
    $('#schedule-toggle').textContent = '− Retirer la planification';
    $('#result-date').value = toLocalDateTime(content.scheduledAt);
  }
  $('#editor-status').textContent =
    'Modifiez puis enregistrez vos changements.';
}

function toLocalDateTime(value) {
  const date = new Date(value);
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
  return date.toISOString().slice(0, 16);
}

async function saveContent(event) {
  event.preventDefault();
  const captions = $$('#caption-fields textarea')
    .map((input) => input.value.trim())
    .filter(Boolean);
  const scheduled = !$('#schedule-fields').classList.contains('hidden');
  const payload = {
    subject: $('#generation-subject').value.trim(),
    format: $('#generation-format').value,
    hook: $('#result-hook').value.trim(),
    script: $('#result-script').value.trim(),
    cta: $('#result-cta').value.trim(),
    captions,
    projectId: $('#generation-project').value || null,
    targetPlatform: scheduled ? $('#result-platform').value || null : null,
    status: scheduled ? 'scheduled' : 'draft',
    scheduledAt:
      scheduled && $('#result-date').value
        ? new Date($('#result-date').value).toISOString()
        : null,
  };
  if (scheduled && (!payload.targetPlatform || !payload.scheduledAt)) {
    $('#editor-status').textContent =
      'Choisissez une plateforme, une date et une heure.';
    return;
  }
  const button = $('#save-content');
  button.disabled = true;
  try {
    if (state.currentContentId) {
      await api(`/content/${encodeURIComponent(state.currentContentId)}`, {
        method: 'PATCH',
        body: JSON.stringify(payload),
      });
      $('#editor-status').textContent = 'Vos modifications sont enregistrées.';
      showToast('Contenu mis à jour.');
    } else {
      const saved = await api('/content', jsonBody(payload));
      state.currentContentId = saved.id;
      $('#editor-status').textContent =
        'Votre brouillon est sauvegardé et modifiable.';
      showToast('Contenu sauvegardé dans votre bibliothèque.');
    }
    await Promise.all([loadQuota(), loadDashboard()]);
  } catch (error) {
    $('#editor-status').textContent = error.message;
    $('#editor-status').classList.add('error');
  } finally {
    button.disabled = false;
  }
}

async function deleteContent(id) {
  if (!window.confirm('Supprimer définitivement ce contenu ?')) return;
  try {
    await api(`/content/${encodeURIComponent(id)}`, { method: 'DELETE' });
    showToast('Contenu supprimé.');
    await Promise.all([loadLibrary(), loadDashboard(), loadCalendar()]);
  } catch (error) {
    showToast(error.message, true);
  }
}

async function loadCalendarContent() {
  await loadCalendar();
}

async function saveProfile(event) {
  event.preventDefault();
  const status = $('#brand-status');
  const button = $("button[type='submit']", event.currentTarget);
  button.disabled = true;
  status.textContent = '';
  try {
    const profile = await api('/profile', {
      method: 'PUT',
      body: JSON.stringify(formValues(event.currentTarget)),
    });
    $('#welcome-name').textContent = profile.brandName;
    status.textContent = 'Votre profil guidera vos prochaines générations.';
    showToast('Profil de marque enregistré.');
  } catch (error) {
    status.textContent = error.message;
    status.classList.add('error');
  } finally {
    button.disabled = false;
  }
}

async function createProject(event) {
  event.preventDefault();
  const form = event.currentTarget;
  try {
    await api('/projects', jsonBody({ name: $('#project-name').value.trim() }));
    form.reset();
    showToast('Projet ajouté.');
    await loadProjects();
  } catch (error) {
    showToast(error.message, true);
  }
}

function renderProjects() {
  const container = $('#project-list');
  container.replaceChildren();
  if (!state.projects.length) {
    const note = document.createElement('p');
    note.className = 'fine-print';
    note.style.textAlign = 'left';
    note.textContent = 'Aucun projet pour le moment.';
    container.append(note);
    return;
  }
  state.projects.forEach((project) => {
    const row = document.createElement('div');
    row.className = 'project-row';
    const name = document.createElement('span');
    name.textContent = project.name;
    const created = document.createElement('small');
    created.textContent = formatDate(project.createdAt);
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'card-action delete';
    remove.textContent = 'Supprimer';
    remove.addEventListener('click', async () => {
      if (!window.confirm(`Supprimer le projet « ${project.name} » ?`)) return;
      try {
        await api(`/projects/${encodeURIComponent(project.id)}`, {
          method: 'DELETE',
        });
        showToast(
          'Projet supprimé. Ses contenus restent dans la bibliothèque.',
        );
        await Promise.all([loadProjects(), loadLibrary()]);
      } catch (error) {
        showToast(error.message, true);
      }
    });
    row.append(name, created, remove);
    container.append(row);
  });
}

async function loadSubscription() {
  try {
    const result = await api('/billing/subscription');
    const statusNamesFr = {
      none: 'Aucun abonnement actif pour le moment.',
      active: 'Votre abonnement est actif.',
      trialing: 'Votre période d’essai est en cours.',
      past_due: 'Le paiement de votre abonnement nécessite votre attention.',
      canceled: 'Votre abonnement est résilié.',
      unpaid: 'Votre abonnement est en attente de paiement.',
      pending: 'Votre paiement est en cours de confirmation par Stripe.',
    };
    $('#subscription-status').textContent =
      `${statusNamesFr[result.status] || `Statut : ${result.status}.`}` +
      (result.currentPeriodEnd
        ? ` Période en cours jusqu’au ${formatDate(result.currentPeriodEnd)}.`
        : '');
    $('#portal-button').classList.toggle('hidden', result.status === 'none');
    $('#billing-button').textContent =
      result.status === 'none'
        ? 'Découvrir les offres ↗'
        : 'Choisir une formule ↗';
  } catch (error) {
    $('#subscription-status').textContent = error.message;
  }
}

async function startCheckout() {
  try {
    const result = await api('/billing/checkout', { method: 'POST' });
    window.location.assign(result.checkoutUrl);
  } catch (error) {
    showToast(error.message, true);
  }
}

async function openBillingPortal() {
  try {
    const result = await api('/billing/portal', { method: 'POST' });
    window.location.assign(result.portalUrl);
  } catch (error) {
    showToast(error.message, true);
  }
}

async function deleteAccount(event) {
  event.preventDefault();
  const errorBox = $('#delete-error');
  const button = $("button[type='submit']", event.currentTarget);
  button.disabled = true;
  errorBox.textContent = '';
  try {
    await api('/account', {
      method: 'DELETE',
      body: JSON.stringify({
        confirmation: $('#delete-confirmation').value,
        password: $('#delete-password').value,
      }),
    });
    $('#delete-dialog').close();
    state.user = null;
    $('#app-view').classList.add('hidden');
    $('#auth-view').classList.remove('hidden');
    renderAuth(
      'login',
      'Votre compte et vos données applicatives ont été supprimés.',
    );
  } catch (error) {
    errorBox.textContent = error.message;
  } finally {
    button.disabled = false;
  }
}

function setDefaultCalendarDates() {
  const now = new Date();
  const first = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const last = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0),
  );
  $('#calendar-from').value = first.toISOString().slice(0, 10);
  $('#calendar-to').value = last.toISOString().slice(0, 10);
}

function registerEvents() {
  $$('.auth-tab').forEach((tab) =>
    tab.addEventListener('click', () => renderAuth(tab.dataset.authTab)),
  );
  document.addEventListener('click', (event) => {
    const pageButton = event.target.closest('[data-page]');
    if (pageButton) {
      event.preventDefault();
      navigate(pageButton.dataset.page);
    }
  });
  $('#logout-button').addEventListener('click', signOut);
  $('#settings-logout-button').addEventListener('click', signOut);
  $('#upgrade-button').addEventListener('click', startCheckout);
  $('#billing-button').addEventListener('click', startCheckout);
  $('#portal-button').addEventListener('click', openBillingPortal);
  $('#generation-form').addEventListener('submit', submitGeneration);
  $('#result-editor').addEventListener('submit', saveContent);
  $('#schedule-toggle').addEventListener('click', () => {
    const fields = $('#schedule-fields');
    const hidden = fields.classList.toggle('hidden');
    $('#schedule-toggle').textContent = hidden
      ? '＋ Planifier'
      : '− Retirer la planification';
  });
  $('#brand-form').addEventListener('submit', saveProfile);
  $('#project-form').addEventListener('submit', createProject);
  $('#filter-project').addEventListener('change', () => loadLibrary());
  $('#filter-status').addEventListener('change', () => loadLibrary());
  $('#filter-platform').addEventListener('change', () => loadLibrary());
  $('#filter-from').addEventListener('change', () => loadLibrary());
  $('#filter-to').addEventListener('change', () => loadLibrary());
  $('#clear-filters').addEventListener('click', () => {
    $('#filter-project').value = '';
    $('#filter-status').value = '';
    $('#filter-platform').value = '';
    $('#filter-from').value = '';
    $('#filter-to').value = '';
    loadLibrary();
  });
  $('#load-calendar').addEventListener('click', loadCalendarContent);
  $('#subject-count').textContent = `0 / ${$('#generation-subject').maxLength}`;
  $('#generation-subject').addEventListener('input', (event) => {
    $('#subject-count').textContent =
      `${event.target.value.length} / ${event.target.maxLength}`;
  });
  $('#delete-account-button').addEventListener('click', () => {
    $('#delete-error').textContent = '';
    $('#delete-form').reset();
    $('#delete-dialog').showModal();
  });
  $('#delete-form').addEventListener('submit', deleteAccount);
  $$('[data-close-dialog]').forEach((button) =>
    button.addEventListener('click', () => $('#delete-dialog').close()),
  );
  $('#delete-dialog').addEventListener('click', (event) => {
    if (event.target === $('#delete-dialog')) $('#delete-dialog').close();
  });
}

async function initialize() {
  registerEvents();
  setDefaultCalendarDates();
  const params = new URLSearchParams(window.location.search);
  const verifyToken = params.get('verify');
  const resetToken = params.get('reset');
  if (verifyToken) {
    renderAuth('verify');
    $('#verify-form').elements.token.value = verifyToken;
  } else if (resetToken) {
    renderAuth('reset');
    $('#reset-form').elements.token.value = resetToken;
  } else {
    renderAuth('login');
  }
  try {
    const result = await api('/auth/me');
    await enterApp(result.user);
  } catch (error) {
    if (error.status !== 401) setAuthMessage(error.message, true);
  }
}

initialize();
