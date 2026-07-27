import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';

const supabaseConfig = window.SUPABASE_CONFIG || {};
const hasSupabaseConfig = Boolean(supabaseConfig.url && supabaseConfig.anonKey);
const supabase = hasSupabaseConfig ? createClient(supabaseConfig.url, supabaseConfig.anonKey) : null;
const googleOAuthEnabled = supabaseConfig.googleOAuthEnabled !== false;
const oauthRedirectUrl = supabaseConfig.oauthRedirectUrl || `${window.location.origin}${window.location.pathname}`;

const page = window.location.pathname.split('/').pop();
const currentPage = page === '' ? 'index.html' : page;

const state = {
  session: null, profile: null, jobs: [], applications: [],
  employees: [], notifications: [], myApplications: [], myNotifications: []
};

const el = {
  googleAuthBtn: document.getElementById('google-auth-btn'),
  authTabs: Array.from(document.querySelectorAll('[data-auth-tab]')),
  authPanels: Array.from(document.querySelectorAll('[data-auth-panel]')),
  signInForm: document.getElementById('sign-in-form'),
  signUpForm: document.getElementById('sign-up-form'),
  signOutButton: document.getElementById('sign-out-button'),
  statusBanner: document.getElementById('status-banner'),
  profileName: document.getElementById('profile-name'),
  hrMetricJobs: document.getElementById('hr-metric-jobs'),
  hrMetricApplicants: document.getElementById('hr-metric-applicants'),
  hrMetricEmployees: document.getElementById('hr-metric-employees'),
  hrMetricAlerts: document.getElementById('hr-metric-alerts'),
  jobForm: document.getElementById('job-form'),
  jobList: document.getElementById('job-list'),
  jobTemplate: document.getElementById('job-template'),
  jobBrowseList: document.getElementById('job-browse-list'),
  jobBrowseTemplate: document.getElementById('job-browse-template'),
  applicationList: document.getElementById('application-list'),
  applicationTemplate: document.getElementById('application-template'),
  employeeList: document.getElementById('employee-list'),
  employeeTemplate: document.getElementById('employee-template'),
  notificationList: document.getElementById('notification-list'),
  applicantApplications: document.getElementById('applicant-applications'),
  applicantNotifications: document.getElementById('applicant-notifications'),
  attachCvForm: document.getElementById('attach-cv-form')
};

function getInitials(name) {
  if (!name) return '??';
  const parts = name.trim().split(' ');
  if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function setStatus(message, kind = 'info') {
  if (!el.statusBanner) return;
  el.statusBanner.textContent = message;
  el.statusBanner.dataset.kind = kind;
  el.statusBanner.hidden = false;
  setTimeout(() => { el.statusBanner.hidden = true; }, 4000);
}

function escapeHtml(value) { return String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
function formatDateTime(value) { return !value ? 'Not set' : new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)); }
function isHr() { return state.profile?.role === 'hr'; }

function alertModal(title, message, dateStr) {
  return new Promise((resolve) => {
    const dialog = document.createElement('dialog');
    dialog.className = 'modal-dialog';
    dialog.innerHTML = `
      <h3 style="margin-bottom:8px; font-size:1.15rem; line-height:1.3;">${title}</h3>
      <span class="eyebrow" style="display:block; margin-bottom:14px;">${dateStr}</span>
      <p style="color:var(--text-muted); margin-bottom:1.5rem; line-height:1.6; font-size:0.95rem; white-space:pre-wrap;">${message}</p>
      <button class="button button-primary full-width" id="modal-alert-ok">Close</button>
    `;
    document.body.appendChild(dialog);
    dialog.showModal();
    dialog.querySelector('#modal-alert-ok').onclick = () => { dialog.close(); dialog.remove(); resolve(); };
  });
}

function promptModal(title, inputHtml) {
  return new Promise((resolve) => {
    const dialog = document.createElement('dialog');
    dialog.className = 'modal-dialog';
    dialog.innerHTML = `
      <h3>${title}</h3>
      <form method="dialog" id="modal-form" class="form-grid">
        ${inputHtml}
        <div style="display:flex; gap:10px; margin-top:1.5rem; grid-column:1/-1;">
          <button type="button" class="button button-secondary" id="modal-cancel" style="flex:1;">Cancel</button>
          <button type="submit" class="button button-primary" style="flex:1;">Confirm</button>
        </div>
      </form>
    `;
    document.body.appendChild(dialog);
    dialog.showModal();

    dialog.querySelector('#modal-cancel').onclick = () => { dialog.close(); dialog.remove(); resolve(null); };
    dialog.querySelector('form').onsubmit = (e) => {
      const formData = new FormData(e.target);
      const data = Object.fromEntries(formData.entries());
      dialog.remove();
      resolve(data);
    };
  });
}

function confirmModal(title, message) {
  return new Promise((resolve) => {
    const dialog = document.createElement('dialog');
    dialog.className = 'modal-dialog';
    dialog.innerHTML = `
      <h3>${title}</h3>
      <p style="color:var(--text-muted); margin-bottom:1.5rem; line-height:1.6;">${message}</p>
      <div style="display:flex; gap:10px;">
        <button class="button button-secondary" id="modal-cancel" style="flex:1;">Cancel</button>
        <button class="button button-primary" id="modal-confirm" style="flex:1; background:var(--bad); border-color:var(--bad); box-shadow:none;">Confirm</button>
      </div>
    `;
    document.body.appendChild(dialog);
    dialog.showModal();

    dialog.querySelector('#modal-cancel').onclick = () => { dialog.close(); dialog.remove(); resolve(false); };
    dialog.querySelector('#modal-confirm').onclick = () => { dialog.close(); dialog.remove(); resolve(true); };
  });
}

function buildTimeline(status) {
  const stages = ['received', 'shortlisted', 'interviewing', 'offer', 'hired'];
  let currentIndex = stages.indexOf(status);
  if (status === 'offer_accepted' || status === 'offer_rejected') currentIndex = 3; 
  if (status === 'rejected') currentIndex = -1;

  let html = '<div class="timeline-wrapper"><div class="timeline-container">';
  stages.forEach((stage, idx) => {
    let stepClass = 'timeline-step';
    if (currentIndex >= idx) stepClass += ' completed';
    if (currentIndex === idx) stepClass += ' active';
    if (status === 'rejected' && idx === 0) stepClass += ' completed'; 
    if (status === 'rejected' && idx === 1) stepClass += ' rejected';

    let label = stage === 'interviewing' ? 'Interview' : stage.charAt(0).toUpperCase() + stage.slice(1);
    
    html += `
      <div class="${stepClass}">
        <div class="timeline-dot"></div>
        <span class="timeline-label">${label}</span>
      </div>
    `;
    if (idx < stages.length - 1) {
      let lineClass = 'timeline-line';
      if (currentIndex > idx) lineClass += ' completed';
      if (status === 'rejected' && idx === 0) lineClass += ' rejected';
      html += `<div class="${lineClass}"></div>`;
    }
  });
  html += '</div></div>';
  return html;
}

function generateCSVReport() {
  let csv = "DAGYES GROUP - HR SYSTEM REPORT\n\n";
  csv += "--- DASHBOARD METRICS ---\n";
  csv += `Open Jobs,${state.jobs.length}\n`;
  csv += `Total Applications,${state.applications.length}\n`;
  csv += `Active Employees,${state.employees.length}\n\n`;
  csv += "--- CURRENT EMPLOYEES ---\n";
  csv += "Employee Code,Name,Role,Department,Status,Salary (GHS)\n";
  state.employees.forEach(e => { csv += `"${e.employee_code}","${e.full_name}","${e.job_title}","${e.department}","${e.employment_status}",${e.salary}\n`; });
  csv += "\n--- APPLICANT PIPELINE ---\n";
  csv += "Applicant Name,Role Applied For,Pipeline Status,Interview Date,Offered Salary (GHS)\n";
  state.applications.forEach(a => {
    const name = a.user_profiles?.full_name || 'Unknown';
    const role = a.job_posts?.title || 'Unknown';
    csv += `"${name}","${role}","${a.status}","${a.interview_at || 'None'}",${a.salary_offered || 'None'}\n`;
  });
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.setAttribute("href", url);
  link.setAttribute("download", `Dagyes_HR_Report_${new Date().toISOString().slice(0,10)}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

function switchAuthTab(tab) {
  el.authTabs.forEach(button => button.classList.toggle('active', button.dataset.authTab === tab));
  el.authPanels.forEach(panel => (panel.hidden = panel.dataset.authPanel !== tab));
}

function setHeader() {
  if (el.profileName) el.profileName.textContent = state.profile?.full_name || 'User Dashboard';
}

async function loadProfile() {
  if (!supabase || !state.session?.user) return null;
  const { data } = await supabase.from('user_profiles').select('*').eq('id', state.session.user.id).maybeSingle();
  state.profile = data || null;
  return state.profile;
}

async function ensureProfile(role, fullName, phone = '', department = '') {
  if (!supabase) throw new Error('Supabase is not configured.');
  await supabase.from('user_profiles').upsert({ id: state.session.user.id, role, full_name: fullName, phone, department });
}

async function loadDashboardData() {
  if (!supabase) return;
  const [jobsRes, applicationsRes, employeesRes, notificationsRes] = await Promise.all([
    supabase.from('job_posts').select('*').order('created_at', { ascending: false }),
    supabase.from('job_applications').select('*, job_posts(title, department, location), application_events(*), user_profiles:applicant_id(full_name, role)').order('updated_at', { ascending: false }),
    supabase.from('employees').select('*').order('updated_at', { ascending: false }),
    supabase.from('notifications').select('*').order('created_at', { ascending: false })
  ]);

  state.jobs = jobsRes.data || [];
  state.applications = applicationsRes.data || [];
  state.employees = employeesRes.data || [];
  state.notifications = notificationsRes.data || [];
  
  if (state.session?.user) {
    state.myApplications = state.applications.filter(item => item.applicant_id === state.session.user.id);
    state.myNotifications = state.notifications.filter(item => item.user_id === state.session.user.id);
  }
}

function renderMetrics() {
  if (el.hrMetricJobs) el.hrMetricJobs.textContent = String(state.jobs.length);
  if (el.hrMetricApplicants) el.hrMetricApplicants.textContent = String(state.applications.length);
  if (el.hrMetricEmployees) el.hrMetricEmployees.textContent = String(state.employees.length);
  if (el.hrMetricAlerts) el.hrMetricAlerts.textContent = String(state.notifications.filter(i => !i.is_read).length);
}

function renderJobCards() {
  if (el.jobList && el.jobTemplate) {
    el.jobList.innerHTML = state.jobs.length === 0 ? '<p class="subtle">No jobs posted yet.</p>' : '';
    state.jobs.forEach(job => {
      const card = el.jobTemplate.content.cloneNode(true);
      card.querySelector('.job-title').textContent = job.title;
      card.querySelector('.job-meta').textContent = `${job.department || 'General'} · ${job.location || 'Anywhere'} · ${job.work_location || 'On-site'} · ${job.employment_type}`;
      card.querySelector('.job-description').textContent = job.description;
      card.querySelector('.job-salary').textContent = `Salary: ${job.salary_min || 'n/a'} - ${job.salary_max || 'n/a'}`;
      card.querySelector('[data-job-edit]').dataset.jobId = job.id;
      card.querySelector('[data-job-close]').dataset.jobId = job.id;
      el.jobList.appendChild(card);
    });
  }

  if (el.jobBrowseList && el.jobBrowseTemplate) {
    el.jobBrowseList.innerHTML = state.jobs.length === 0 ? '<p class="subtle">No vacancies currently.</p>' : '';
    state.jobs.forEach(job => {
      const browse = el.jobBrowseTemplate.content.cloneNode(true);
      browse.querySelector('.browse-title').textContent = job.title;
      browse.querySelector('.browse-meta').textContent = `${job.department || 'General'} · ${job.location || 'Anywhere'} · ${job.work_location || 'On-site'} · ${job.employment_type}`;
      browse.querySelector('.browse-description').textContent = job.description;
      browse.querySelector('[data-job-apply]').dataset.jobId = job.id;
      el.jobBrowseList.appendChild(browse);
    });
  }
}

function renderApplications() {
  const stages = ['received', 'shortlisted', 'interviewing', 'offer', 'hired'];
  stages.forEach(status => {
    const col = document.getElementById(`list-${status}`);
    const count = document.getElementById(`count-${status}`);
    if (col) col.innerHTML = '';
    if (count) count.textContent = '0';
  });

  if (!el.applicationTemplate) return;
  
  const counts = { received: 0, shortlisted: 0, interviewing: 0, offer: 0, hired: 0 };

  state.applications.forEach(app => {
    if (app.status === 'rejected') return; 
    
    let colStatus = app.status;
    if (app.status === 'offer_accepted' || app.status === 'offer_rejected') colStatus = 'offer';
    
    const list = document.getElementById(`list-${colStatus}`);
    if (!list) return;

    counts[colStatus]++;

    const card = el.applicationTemplate.content.cloneNode(true);
    const picWrap = card.querySelector('.app-profile-pic');
    
    const candidateName = app.user_profiles?.full_name || 'Candidate';
    const initials = getInitials(candidateName);
    
    // Hardcoded to render initials exclusively
    if (picWrap) {
      picWrap.innerHTML = `<div class="avatar-fallback">${escapeHtml(initials)}</div>`;
    }

    card.querySelector('.app-name').textContent = candidateName;
    card.querySelector('.app-role-name').textContent = app.job_posts?.title || 'Unknown Role';
    
    let displayStatusLabel = app.status.replace('_', ' ').toUpperCase();
    let statusColor = 'color:var(--primary);';
    if(app.status === 'offer_accepted') statusColor = 'color:var(--good);';
    if(app.status === 'offer_rejected') statusColor = 'color:var(--bad);';
    
    card.querySelector('.status-pill').textContent = displayStatusLabel;
    card.querySelector('.status-pill').style = `background:#e0e7ff; ${statusColor}`;

    let highlightNoteStyle = '';
    if (app.status === 'offer_accepted' || app.status === 'offer_rejected') {
      highlightNoteStyle = 'background:rgba(37,99,235,0.06); border-left:3px solid var(--primary); padding:6px 10px; border-radius:6px;';
    }

    card.querySelector('.app-meta').innerHTML = `
      <strong>CV:</strong> ${app.cv_url ? `<a href="${app.cv_url}" target="_blank" style="color:var(--primary);">View File</a>` : 'None'} <br/> 
      <strong>Interview:</strong> ${app.interview_at ? formatDateTime(app.interview_at) : 'Not scheduled'}<br/>
      <div style="margin-top:6px; margin-bottom:10px; ${highlightNoteStyle}">
        <strong>Latest Note:</strong> <span style="color:var(--text-soft);">${escapeHtml(app.hr_notes || 'Awaiting review.')}</span>
      </div>
      <details style="margin-top:0.6rem; background:rgba(0,0,0,0.03); padding:8px 10px; border-radius:10px; overflow:hidden;">
        <summary style="cursor:pointer; font-weight:700; color:var(--text-main);">View Cover Letter</summary>
        <div style="margin-top:6px; white-space:pre-wrap; overflow-wrap:anywhere; word-break:normal; font-size:0.8rem; color:var(--text-soft);">${escapeHtml(app.cover_letter || 'No cover letter provided.')}</div>
      </details>
    `;
    card.querySelectorAll('button').forEach(btn => btn.closest('article').dataset.applicationId = app.id);
    list.appendChild(card);
  });

  stages.forEach(status => {
    const countEl = document.getElementById(`count-${status}`);
    if (countEl) countEl.textContent = counts[status];
  });
}

function renderEmployees() {
  if (!el.employeeList || !el.employeeTemplate) return;
  el.employeeList.innerHTML = state.employees.length === 0 ? '<p class="subtle">No employees yet.</p>' : '';
  
  state.employees.forEach(emp => {
    const card = el.employeeTemplate.content.cloneNode(true);
    card.querySelector('.employee-name').textContent = emp.full_name;
    card.querySelector('.employee-role').textContent = `${emp.job_title} · ${emp.department || 'Unassigned'}`;
    card.querySelector('.employee-meta').textContent = `Code: ${emp.employee_code} · Status: ${emp.employment_status}`;
    card.querySelector('[data-employee-status]').dataset.employeeId = emp.id;
    card.querySelector('[data-employee-terminate]').dataset.employeeId = emp.id;
    card.querySelector('[data-employee-remove]').dataset.employeeId = emp.id; 
    el.employeeList.appendChild(card);
  });
}

function renderNotifications() {
  const render = (target, items) => {
    if (!target) return;
    target.innerHTML = items.length === 0 ? '<p class="subtle">All clear! No alerts.</p>' : '';
    items.forEach(n => {
      const readClass = n.is_read ? 'read' : 'unread';
      const readActionHtml = n.is_read ? '' : `<button class="button button-secondary" style="padding:2px 8px; font-size:0.75rem;" data-notification-read="${n.id}">Mark as read</button>`;

      target.insertAdjacentHTML('beforeend', `
        <article class="card notification-card ${readClass}" style="box-shadow:none; padding:12px 16px; margin-bottom:1rem; cursor:pointer;" data-notification-id="${n.id}">
          <div style="display:flex; justify-content:space-between; align-items:flex-start;">
            <strong style="color:var(--text-main);">${escapeHtml(n.title)}</strong>
            <div style="display:flex; gap:8px;">
              ${readActionHtml}
              <button class="button button-secondary" style="padding:2px 8px; font-size:0.8rem; border:none; background:transparent; color:var(--bad);" title="Dismiss" data-notification-delete="${n.id}">✕</button>
            </div>
          </div>
          <p style="font-size:0.85rem; margin-top:8px; color:var(--primary); font-weight:600;">Tap to view details &rarr;</p>
          <small class="eyebrow" style="display:block; margin-top:8px;">${formatDateTime(n.created_at)}</small>
        </article>
      `);
    });
  };
  render(el.notificationList, state.notifications);
  render(el.applicantNotifications, state.myNotifications);
}

function renderApplicantArea() {
  if (!el.applicantApplications) return;
  el.applicantApplications.innerHTML = state.myApplications.length === 0 ? '<p class="subtle">No applications submitted.</p>' : '';
  
  state.myApplications.forEach(app => {
    const card = document.createElement('article');
    card.className = 'card';
    card.style = "box-shadow:none; border-color:#e2e8f0; margin-bottom:1rem; overflow:hidden;";
    
    let offerActions = '';
    if (app.status === 'offer') {
      offerActions = `
        <div style="margin-top:1.2rem; padding:1.2rem; background:var(--bg-1); border:1px solid var(--primary); border-radius:14px;">
          <h4 style="margin-bottom:8px; color:var(--text-main); font-size:1.1rem;">🎉 You have a job offer!</h4>
          <p style="font-size:0.95rem; margin-bottom:14px; color:var(--text-muted);">Proposed Salary: <strong>GHS ${app.salary_offered}</strong></p>
          <div style="display:flex; gap:10px;">
            <button class="button button-primary" data-app-respond="accept" data-app-id="${app.id}">Accept Offer</button>
            <button class="button button-secondary" style="color:var(--bad);" data-app-respond="reject" data-app-id="${app.id}">Reject</button>
          </div>
        </div>
      `;
    }

    const applicantName = app.user_profiles?.full_name || 'Candidate';
    const initials = getInitials(applicantName);

    let friendlyNote = 'Your application has been received and is awaiting review.';
    if (app.status === 'shortlisted') friendlyNote = 'You have been shortlisted by our HR team.';
    if (app.status === 'interviewing') friendlyNote = `Your interview is scheduled for ${app.interview_at ? formatDateTime(app.interview_at) : 'soon'}.`;
    if (app.status === 'offer') friendlyNote = `You have received a job offer of GHS ${app.salary_offered}.`;
    if (app.status === 'hired') friendlyNote = 'Congratulations! You have been successfully hired.';
    if (app.status === 'rejected') friendlyNote = 'We regret to inform you that your application was rejected.';
    if (app.status === 'offer_accepted') friendlyNote = 'You accepted the job offer. We will contact you for onboarding.';
    if (app.status === 'offer_rejected') friendlyNote = 'You declined the job offer.';

    card.innerHTML = `
      <div class="app-card-header">
        <div class="app-card-identity">
          <div class="avatar-fallback-lg">${escapeHtml(initials)}</div>
          <div style="min-width:0;">
            <h3 style="margin:0; font-size:1.1rem;">${escapeHtml(app.job_posts?.title || '')}</h3>
            <p style="margin:0.2rem 0 0; font-size:0.9rem; color:var(--text-soft);">${escapeHtml(applicantName)}</p>
          </div>
        </div>
        <div class="app-card-actions">
          <span class="status-pill" style="background:#e0e7ff; color:var(--primary);">${escapeHtml(app.status.replace('_',' ').toUpperCase())}</span>
          <button class="button button-secondary" style="padding:0.3rem 0.8rem; font-size:0.8rem; color:var(--bad);" data-app-delete="${app.id}">Withdraw</button>
        </div>
      </div>
      
      ${buildTimeline(app.status)}
      
      <div style="background:rgba(0,0,0,0.02); border-radius:12px; padding:12px; margin-top:12px;">
        <p style="margin:0; font-size:0.9rem; color:var(--text-muted);"><strong>Latest Note:</strong> ${escapeHtml(friendlyNote)}</p>
      </div>
      ${offerActions}
    `;
    el.applicantApplications.appendChild(card);
  });
}

async function syncAndRender() {
  await loadDashboardData();
  setHeader();
  renderMetrics();
  renderJobCards();
  renderApplications();
  renderEmployees();
  renderNotifications();
  renderApplicantArea();
}

function setupAuthUI() {
  const roleSelect = document.getElementById('role-select');
  const passkeyContainer = document.getElementById('hr-passkey-container');
  if (roleSelect && passkeyContainer) {
    roleSelect.addEventListener('change', (e) => {
      passkeyContainer.hidden = e.target.value !== 'hr';
      passkeyContainer.querySelector('input').required = e.target.value === 'hr';
    });
  }

  document.querySelectorAll('.toggle-password').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const input = e.currentTarget.previousElementSibling;
      const svgPath = e.currentTarget.querySelector('path');
      if (input.type === 'password') {
        input.type = 'text';
        svgPath.setAttribute('d', 'M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24');
        e.currentTarget.innerHTML += '<line x1="1" y1="1" x2="23" y2="23" stroke="currentColor" stroke-width="2" stroke-linecap="round" class="slash"></line>';
      } else {
        input.type = 'password';
        svgPath.setAttribute('d', 'M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z');
        const slash = e.currentTarget.querySelector('.slash');
        if(slash) slash.remove();
      }
    });
  });

  const signupPass = document.getElementById('signup-password');
  if (signupPass) {
    const reqLen = document.getElementById('req-len');
    const reqUp = document.getElementById('req-up');
    const reqNum = document.getElementById('req-num');

    signupPass.addEventListener('input', (e) => {
      const val = e.target.value;
      if (val.length >= 8) reqLen.classList.add('valid'); else reqLen.classList.remove('valid');
      if (/[A-Z]/.test(val)) reqUp.classList.add('valid'); else reqUp.classList.remove('valid');
      if (/[0-9\W]/.test(val)) reqNum.classList.add('valid'); else reqNum.classList.remove('valid');
    });
  }
}

async function handleAuthForm(event, isSignUp) {
  event.preventDefault();
  if (!supabase) return setStatus('Supabase is not configured.', 'error');
  
  const submitBtn = event.currentTarget.querySelector('button[type="submit"]');
  const originalText = submitBtn.textContent;
  submitBtn.textContent = 'Please wait...';
  submitBtn.disabled = true;

  try {
    const form = event.currentTarget;
    const email = form.email.value;
    const password = form.password.value;
    
    if (isSignUp) {
      const confirmPassword = form.confirm_password.value;
      if (password !== confirmPassword) throw new Error("Passwords do not match.");
      if (password.length < 8 || !/[A-Z]/.test(password) || !/[0-9\W]/.test(password)) {
        throw new Error("Password does not meet minimum strength requirements.");
      }

      const selectedRole = form.role.value;
      const requiredPasskey = supabaseConfig.hrSignupPasskey || '';
      const enteredPasskey = form.hr_passkey?.value || '';

      if (selectedRole === 'hr' && (!requiredPasskey || enteredPasskey !== requiredPasskey)) {
        throw new Error('Invalid HR passkey. Contact the administrator for the code.');
      }

      const metadata = { role: selectedRole, full_name: form.full_name.value };
      const { data, error } = await supabase.auth.signUp({ email, password, options: { data: metadata } });
      
      if (error) throw error;
      
      if (data.session) {
        state.session = data.session;
        await ensureProfile(metadata.role, metadata.full_name, '', '');
      } else {
        setStatus('Account created! Please check your email to confirm your address.', 'success');
        form.reset();
        switchAuthTab('sign-in');
        return;
      }
    } else {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
    }
    
    await boot();
  } catch (error) { 
    let friendlyMessage = error.message;
    if (friendlyMessage.toLowerCase().includes('already registered') || friendlyMessage.toLowerCase().includes('already exists')) {
      friendlyMessage = 'An account with this email already exists. Please sign in.';
    } else if (friendlyMessage.toLowerCase().includes('invalid login credentials')) {
      friendlyMessage = 'Incorrect email or password. Please try again.';
    } else if (friendlyMessage.toLowerCase().includes('email not confirmed')) {
      friendlyMessage = 'Please check your inbox and verify your email address before logging in.';
    }
    setStatus(friendlyMessage, 'error'); 
  } finally {
    submitBtn.textContent = originalText;
    submitBtn.disabled = false;
  }
}

async function handleGoogleAuth(event) {
  event.preventDefault();
  if (!supabase) return;
  try {
    const { error } = await supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: oauthRedirectUrl }});
    if (error) throw error;
  } catch (error) { setStatus('Failed to connect to Google.', 'error'); }
}

async function handlePostJob(event) {
  event.preventDefault();
  if (!supabase) return;
  const form = event.currentTarget;
  const submitBtn = form.querySelector('button[type="submit"]');
  submitBtn.disabled = true;

  try {
    const { error } = await supabase.from('job_posts').insert({
      created_by: state.session.user.id, title: form.title.value, department: form.department.value,
      location: form.location.value, work_location: form.work_location.value, employment_type: form.employment_type.value,
      description: form.description.value, salary_min: form.salary_min.value || null,
      salary_max: form.salary_max.value || null, status: 'open'
    });
    if (error) throw error;
    form.reset();
    await syncAndRender();
    setStatus('Job posted successfully.', 'success');
  } catch (error) { setStatus('Failed to post job. Please try again.', 'error'); } finally { submitBtn.disabled = false; }
}

async function handleApply(event) {
  event.preventDefault();
  if (!supabase) return;
  const form = event.currentTarget;
  const submitBtn = form.querySelector('button[type="submit"]');
  submitBtn.disabled = true;
  submitBtn.textContent = 'Uploading...';

  const cv = form.cv.files[0];
  let cvUrl = '';

  try {
    if (cv) {
      const timestampId = Date.now();
      const { error } = await supabase.storage.from('cvs').upload(`${state.session.user.id}/${timestampId}_cv`, cv, { upsert: true });
      if (error) throw error;
      cvUrl = supabase.storage.from('cvs').getPublicUrl(`${state.session.user.id}/${timestampId}_cv`).data.publicUrl;
    }

    const { error } = await supabase.from('job_applications').insert({
      applicant_id: state.session.user.id, job_post_id: form.job_id.value, cover_letter: form.cover_letter.value,
      cv_url: cvUrl, status: 'received'
    });
    if (error) {
       if (error.message.includes('duplicate key value')) throw new Error("You have already applied for this job.");
       throw error;
    }

    form.reset();
    await syncAndRender();
    setStatus('Application submitted successfully!', 'success');
  } catch (error) { setStatus(error.message, 'error'); } finally { 
    submitBtn.textContent = 'Submit Application';
    submitBtn.disabled = false; 
  }
}

window.addEventListener('scroll', () => {
  const btn = document.getElementById('back-to-top');
  if (btn) {
    if (window.scrollY > 300) btn.classList.add('visible');
    else btn.classList.remove('visible');
  }
});

// Global Click Handlers
document.addEventListener('click', async (e) => {
  if (!supabase) return;

  if (e.target.closest('#back-to-top')) {
    window.scrollTo({ top: 0, behavior: 'smooth' });
    return;
  }

  const scrollChip = e.target.closest('[data-scroll-to]');
  if (scrollChip) {
    const targetElement = document.getElementById(scrollChip.dataset.scrollTo);
    if (targetElement) {
      targetElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    return;
  }

  if (e.target.closest('#generate-report-btn')) {
    generateCSVReport();
    return;
  }

  const notifyCard = e.target.closest('[data-notification-id]');
  if (notifyCard) {
    if (e.target.closest('[data-notification-delete]') || e.target.closest('[data-notification-read]')) {
      // Ignored here
    } else {
      const notification = (isHr() ? state.notifications : state.myNotifications).find(n => n.id === notifyCard.dataset.notificationId);
      if (notification) {
        if (!notification.is_read) {
          await supabase.from('notifications').update({ is_read: true }).eq('id', notification.id);
        }
        await alertModal(escapeHtml(notification.title), escapeHtml(notification.body), formatDateTime(notification.created_at));
        await syncAndRender();
      }
      return;
    }
  }

  const appRespondBtn = e.target.closest('[data-app-respond]');
  if (appRespondBtn) {
    const action = appRespondBtn.dataset.appRespond;
    const appId = appRespondBtn.dataset.appId;
    const application = state.applications.find(a => a.id === appId);
    const newStatus = action === 'accept' ? 'offer_accepted' : 'offer_rejected';
    
    const applicantName = state.profile?.full_name || 'Candidate';
    const hrNote = action === 'accept' ? `${applicantName} accepted the offer! Ready to be Hired.` : `${applicantName} rejected the job offer.`;
    
    await supabase.from('job_applications').update({ status: newStatus, hr_notes: hrNote }).eq('id', appId);
    await supabase.from('application_events').insert({ job_application_id: appId, actor_id: state.session.user.id, stage: newStatus, note: hrNote });
    
    const { data: hrUsers } = await supabase.from('user_profiles').select('id').eq('role', 'hr');
    if (hrUsers && hrUsers.length > 0) {
       const hrNotifications = hrUsers.map(hr => ({
         user_id: hr.id,
         job_application_id: appId,
         channel: 'dashboard',
         type: `offer_response`,
         title: `Offer Response`,
         body: `Candidate: ${applicantName}\nRole: ${application.job_posts?.title}\nUpdate: The candidate has ${action}ed the offer.`,
         is_read: false
       }));
       await supabase.from('notifications').insert(hrNotifications);
    }

    await syncAndRender();
    setStatus(`Offer formally ${action}ed! HR has been notified.`, 'success');
    return;
  }

  if (e.target.dataset.action === 'clear-alerts') {
    if (isHr()) await supabase.from('notifications').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    else await supabase.from('notifications').delete().eq('user_id', state.session.user.id);
    await syncAndRender();
    return;
  }

  const notifyDeleteBtn = e.target.closest('[data-notification-delete]');
  if (notifyDeleteBtn) {
    e.stopPropagation();
    await supabase.from('notifications').delete().eq('id', notifyDeleteBtn.dataset.notificationDelete);
    await syncAndRender();
    return;
  }

  const notifyReadBtn = e.target.closest('[data-notification-read]');
  if (notifyReadBtn) {
    e.stopPropagation();
    await supabase.from('notifications').update({ is_read: true }).eq('id', notifyReadBtn.dataset.notificationRead);
    await syncAndRender();
    return;
  }

  // WITHDRAWAL CONFIRMATION
  const appDeleteBtn = e.target.closest('[data-app-delete]');
  if (appDeleteBtn) {
    e.preventDefault();
    const isConfirmed = await confirmModal('Withdraw Application', 'Are you sure you want to withdraw your application? This action cannot be undone.');
    if (!isConfirmed) return;
    
    await supabase.from('job_applications').delete().eq('id', appDeleteBtn.dataset.appDelete);
    await syncAndRender();
    setStatus('Application withdrawn.', 'success');
    return;
  }

  const jobBtn = e.target.closest('[data-job-edit], [data-job-close], [data-job-apply]');
  if (jobBtn) {
    const jobId = jobBtn.dataset.jobId;
    if (jobBtn.hasAttribute('data-job-apply') && el.attachCvForm) {
      const job = state.jobs.find(item => item.id === jobId);
      el.attachCvForm.job_id.value = jobId;
      if (el.attachCvForm.job_name_display) el.attachCvForm.job_name_display.value = job?.title || 'Selected job';
      el.attachCvForm.scrollIntoView({ behavior: 'smooth' });
    }
    
    if (jobBtn.hasAttribute('data-job-close')) {
      const isConfirmed = await confirmModal('Delete Job Posting', 'Are you sure you want to permanently delete this job? All associated applications will also be removed.');
      if (isConfirmed) {
        await supabase.from('job_posts').delete().eq('id', jobId);
        await syncAndRender();
        setStatus('Job deleted successfully.', 'success');
      }
    }
    
    if (jobBtn.hasAttribute('data-job-edit')) {
      const job = state.jobs.find(item => item.id === jobId);
      if (!job) return;
      
      const result = await promptModal('Edit Job Posting', `
        <label class="full-width">Job Title <input type="text" name="title" value="${escapeHtml(job.title)}" required /></label>
        <label>Department <input type="text" name="department" value="${escapeHtml(job.department || '')}" /></label>
        <label>Location <input type="text" name="location" value="${escapeHtml(job.location || '')}" /></label>
        <label>Work Setup 
          <select name="work_location">
            <option value="On-site" ${job.work_location === 'On-site' ? 'selected' : ''}>On-site</option>
            <option value="Remote" ${job.work_location === 'Remote' ? 'selected' : ''}>Remote</option>
            <option value="Hybrid" ${job.work_location === 'Hybrid' ? 'selected' : ''}>Hybrid</option>
          </select>
        </label>
        <label>Type 
          <select name="employment_type">
            <option value="Full-time" ${job.employment_type === 'Full-time' ? 'selected' : ''}>Full-time</option>
            <option value="Part-time" ${job.employment_type === 'Part-time' ? 'selected' : ''}>Part-time</option>
            <option value="Contract" ${job.employment_type === 'Contract' ? 'selected' : ''}>Contract</option>
          </select>
        </label>
        <label>Min Salary <input type="number" name="salary_min" value="${job.salary_min || ''}" /></label>
        <label>Max Salary <input type="number" name="salary_max" value="${job.salary_max || ''}" /></label>
        <label class="full-width">Description <textarea name="description" required rows="4">${escapeHtml(job.description || '')}</textarea></label>
      `);
      
      if (result) {
        await supabase.from('job_posts').update({
          title: result.title,
          department: result.department,
          location: result.location,
          work_location: result.work_location,
          employment_type: result.employment_type,
          salary_min: result.salary_min || null,
          salary_max: result.salary_max || null,
          description: result.description
        }).eq('id', jobId);
        await syncAndRender();
        setStatus('Job updated successfully.', 'success');
      }
    }
    return;
  }

  const appBtn = e.target.closest('[data-application-action]');
  if (appBtn) {
    const application = state.applications.find(item => item.id === appBtn.closest('article')?.dataset?.applicationId);
    if (!application) return;
    const action = appBtn.dataset.applicationAction;
    
    const candidateName = application.user_profiles?.full_name || 'Candidate';

    if (action !== 'reject') {
       let targetedStatus = action === 'shortlist' ? 'shortlisted' : action === 'offer' ? 'offer' : action === 'hire' ? 'hired' : 'interviewing';
       if (application.status === targetedStatus) {
          setStatus(`Application is already marked as ${targetedStatus}.`, 'info');
          return;
       }
    }
    
    if (action === 'reject') {
      const isConfirmed = await confirmModal('Reject Application', 'Are you sure you want to completely remove this application from the HR pipeline?');
      if (!isConfirmed) return;

      await supabase.from('job_applications').delete().eq('id', application.id);
      await supabase.from('notifications').insert({ 
        user_id: application.applicant_id, 
        channel: 'dashboard', 
        type: `application_rejected`, 
        title: `Application Update`, 
        body: `Role: ${application.job_posts?.title}\nUpdate: We regret to inform you that your application was rejected after review.`, 
        is_read: false 
      });
      await syncAndRender();
      return;
    }

    let status = action === 'shortlist' ? 'shortlisted' : action === 'offer' ? 'offer' : action === 'hire' ? 'hired' : 'interviewing';
    let updates = { status, updated_at: new Date().toISOString() };
    
    let hrNote = '';
    let applicantMsg = '';
    
    if (action === 'shortlist') {
      hrNote = `${candidateName} was shortlisted.`;
      applicantMsg = `You have been shortlisted by HR.`;
    } else if (action === 'interview') {
      const result = await promptModal(`Schedule Interview`, '<label class="full-width">Date & Time <input type="datetime-local" name="datetime" required></label>');
      if (!result) return;
      updates.interview_at = result.datetime;
      hrNote = `Interview scheduled for ${candidateName} on ${formatDateTime(result.datetime)}.`;
      applicantMsg = `Your interview is scheduled for ${formatDateTime(result.datetime)}.`;
    } else if (action === 'offer') {
      const result = await promptModal(`Send Job Offer`, '<label class="full-width">Salary Amount (GHS) <input type="number" name="salary" placeholder="e.g. 5000" required></label>');
      if (!result) return;
      updates.salary_offered = Number(result.salary);
      hrNote = `Offer of GHS ${result.salary} sent to ${candidateName}. Awaiting response.`;
      applicantMsg = `You have received a job offer of GHS ${result.salary}. Tap here to respond.`;
    } else if (action === 'hire') {
      updates.salary_offered = application.salary_offered || 0;
      hrNote = `${candidateName} successfully hired!`;
      applicantMsg = `Congratulations! You have been successfully hired!`;
    }

    updates.hr_notes = hrNote;
    await supabase.from('job_applications').update(updates).eq('id', application.id);
    
    await supabase.from('notifications').insert({ 
      user_id: application.applicant_id, 
      channel: 'dashboard', 
      type: `application_${status}`, 
      title: `Application Update`, 
      body: `Role: ${application.job_posts?.title}\nUpdate: ${applicantMsg}`, 
      is_read: false 
    });
    
    if (action === 'hire') {
      await supabase.from('employees').insert({
        user_id: application.applicant_id, job_application_id: application.id, employee_code: `EMP-${String(Date.now()).slice(-5)}`,
        full_name: candidateName, department: application.job_posts?.department || '',
        job_title: application.job_posts?.title || '', employment_status: 'onboarding', salary: updates.salary_offered || 0,
        start_date: new Date().toISOString().slice(0, 10)
      });
    }

    await supabase.from('application_events').insert({
      job_application_id: application.id,
      actor_id: state.session.user.id,
      stage: status,
      note: updates.hr_notes
    });

    await syncAndRender();
    return;
  }

  const empBtn = e.target.closest('[data-employee-status], [data-employee-terminate], [data-employee-remove]');
  if (empBtn) {
    if (empBtn.hasAttribute('data-employee-status')) {
      const status = window.prompt('Status: onboarding, active, suspended, terminated, resigned', 'active');
      if (status) await supabase.from('employees').update({ employment_status: status }).eq('id', empBtn.dataset.employeeId);
    }
    if (empBtn.hasAttribute('data-employee-terminate')) {
      const note = window.prompt('Termination note', 'Employment ended by HR.');
      if (note) await supabase.from('employees').update({ employment_status: 'terminated', end_date: new Date().toISOString().slice(0, 10) }).eq('id', empBtn.dataset.employeeId);
    }
    if (empBtn.hasAttribute('data-employee-remove')) {
      const isConfirmed = await confirmModal('Remove Employee', 'Are you sure you want to permanently delete this employee record?');
      if (!isConfirmed) return;
      await supabase.from('employees').delete().eq('id', empBtn.dataset.employeeId);
    }
    await syncAndRender();
  }
});

async function boot() {
  if (!supabase) return;
  const { data } = await supabase.auth.getSession();
  state.session = data?.session || null;

  if (!state.session) {
    setupAuthUI();
    if (currentPage !== 'index.html') return window.location.href = 'index.html';
  } else {
    await loadProfile();
    if (!state.profile) {
      const meta = state.session.user.user_metadata || {};
      await ensureProfile(meta.role || 'applicant', meta.full_name || state.session.user.email, '', '');
      await loadProfile();
    }
    if (state.profile?.role === 'hr' && currentPage !== 'hr.html') return window.location.href = 'hr.html';
    if (state.profile?.role === 'applicant' && currentPage !== 'applicant.html') return window.location.href = 'applicant.html';
  }

  if (el.authTabs.length) el.authTabs.forEach(btn => btn.addEventListener('click', () => switchAuthTab(btn.dataset.authTab)));
  if (el.signInForm) el.signInForm.addEventListener('submit', e => handleAuthForm(e, false));
  if (el.signUpForm) el.signUpForm.addEventListener('submit', e => handleAuthForm(e, true));
  if (el.signOutButton) el.signOutButton.addEventListener('click', async () => { await supabase.auth.signOut(); window.location.href = 'index.html'; });
  if (el.jobForm) el.jobForm.addEventListener('submit', handlePostJob);
  if (el.attachCvForm) el.attachCvForm.addEventListener('submit', handleApply);
  if (el.googleAuthBtn && googleOAuthEnabled) el.googleAuthBtn.addEventListener('click', handleGoogleAuth);

  if (state.session) await syncAndRender();
}

boot();