const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');

const PORT = Number(process.env.PORT || 3000);
const ROOT_DIR = __dirname;
const PUBLIC_FILES = new Set(['/', '/index.html', '/styles.css', '/app.js']);
const CONTENT_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml; charset=utf-8'
};

const db = new DatabaseSync(path.join(ROOT_DIR, 'hr-track.db'));
initializeDatabase();
seedDatabase();

const server = http.createServer(async (req, res) => {
  try {
    const requestUrl = new URL(req.url, `http://${req.headers.host}`);

    if (requestUrl.pathname === '/api/applications' && req.method === 'GET') {
      return sendJson(res, 200, { applications: listApplications(requestUrl.searchParams) });
    }

    if (requestUrl.pathname === '/api/applications' && req.method === 'POST') {
      const body = await readJson(req);
      const created = createApplication(body);
      return sendJson(res, 201, { application: created });
    }
      if (requestUrl.pathname === '/api/applications' && req.method === 'DELETE') {
        resetDatabase();
        return sendJson(res, 200, { ok: true });
      }

    const applicationMatch = requestUrl.pathname.match(/^\/api\/applications\/([^/]+)$/);
    if (applicationMatch && req.method === 'PATCH') {
      const body = await readJson(req);
      const updated = updateApplication(applicationMatch[1], body);
      if (!updated) {
        return sendJson(res, 404, { error: 'Application not found' });
      }
      return sendJson(res, 200, { application: updated });
    }

    if (requestUrl.pathname === '/api/summary' && req.method === 'GET') {
      return sendJson(res, 200, buildSummary());
    }

    if (requestUrl.pathname === '/api/lookup' && req.method === 'GET') {
      const query = String(requestUrl.searchParams.get('q') || '').trim();
      const application = lookupApplication(query);
      if (!application) {
        return sendJson(res, 404, { error: 'Application not found' });
      }
      return sendJson(res, 200, { application });
    }

    if (PUBLIC_FILES.has(requestUrl.pathname)) {
      const fileName = requestUrl.pathname === '/' ? '/index.html' : requestUrl.pathname;
      return serveFile(res, path.join(ROOT_DIR, fileName));
    }

    return sendJson(res, 404, { error: 'Not found' });
  } catch (error) {
    console.error(error);
    return sendJson(res, 500, { error: 'Internal server error' });
  }
});

server.listen(PORT, () => {
  console.log(`Northstar HR Track running at http://localhost:${PORT}`);
});

function initializeDatabase() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS applications (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      phone TEXT NOT NULL,
      role TEXT NOT NULL,
      status TEXT NOT NULL,
      appliedAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL,
      interviewDate TEXT NOT NULL DEFAULT '',
      notes TEXT NOT NULL,
      history TEXT NOT NULL
    );
  `);
}

function seedDatabase() {
  const count = db.prepare('SELECT COUNT(*) AS count FROM applications').get().count;
  if (count > 0) {
    return;
  }

  const insert = db.prepare(`
    INSERT INTO applications (id, name, email, phone, role, status, appliedAt, updatedAt, interviewDate, notes, history)
    VALUES (@id, @name, @email, @phone, @role, @status, @appliedAt, @updatedAt, @interviewDate, @notes, @history)
  `);
  resetDatabase();

  demoApplications().forEach((application) => insert.run(serializeApplication(application)));
}

function resetDatabase() {
  db.exec('DELETE FROM applications');
}
function demoApplications() {
  return [
    {
      id: 'HR-1001',
      name: 'Amina Mensah',
      email: 'amina.mensah@example.com',
      phone: '+233 500 111 222',
      role: 'Human Resources Officer',
      status: 'interviewing',
      appliedAt: '2026-07-10T09:15:00.000Z',
      updatedAt: '2026-07-17T14:30:00.000Z',
      interviewDate: '2026-07-23',
      notes: 'Strong payroll and employee relations background. Interview booked with HR manager.',
      history: [
        { stage: 'received', at: '2026-07-10T09:15:00.000Z', note: 'Application received.' },
        { stage: 'shortlisted', at: '2026-07-12T11:00:00.000Z', note: 'CV matched the role requirements.' },
        { stage: 'interviewing', at: '2026-07-17T14:30:00.000Z', note: 'Interview scheduled.' }
      ]
    },
    {
      id: 'HR-1002',
      name: 'Kofi Owusu',
      email: 'kofi.owusu@example.com',
      phone: '+233 500 333 444',
      role: 'Recruitment Assistant',
      status: 'offer',
      appliedAt: '2026-07-03T08:40:00.000Z',
      updatedAt: '2026-07-19T10:15:00.000Z',
      interviewDate: '2026-07-14',
      notes: 'Excellent screening test. Offer sent for final review.',
      history: [
        { stage: 'received', at: '2026-07-03T08:40:00.000Z', note: 'Application received.' },
        { stage: 'shortlisted', at: '2026-07-05T13:20:00.000Z', note: 'Shortlisted by HR.' },
        { stage: 'interviewing', at: '2026-07-11T09:00:00.000Z', note: 'Interview completed.' },
        { stage: 'offer', at: '2026-07-19T10:15:00.000Z', note: 'Offer prepared.' }
      ]
    },
    {
      id: 'HR-1003',
      name: 'Sarah Badu',
      email: 'sarah.badu@example.com',
      phone: '+233 500 555 666',
      role: 'Office Administrator',
      status: 'hired',
      appliedAt: '2026-06-28T12:00:00.000Z',
      updatedAt: '2026-07-16T16:05:00.000Z',
      interviewDate: '2026-07-06',
      notes: 'Candidate accepted the offer and is scheduled for onboarding.',
      history: [
        { stage: 'received', at: '2026-06-28T12:00:00.000Z', note: 'Application received.' },
        { stage: 'shortlisted', at: '2026-07-01T09:45:00.000Z', note: 'Shortlisted after CV screening.' },
        { stage: 'interviewing', at: '2026-07-06T10:30:00.000Z', note: 'Interview completed.' },
        { stage: 'offer', at: '2026-07-09T15:10:00.000Z', note: 'Offer accepted.' },
        { stage: 'hired', at: '2026-07-16T16:05:00.000Z', note: 'Candidate hired.' }
      ]
    },
    {
      id: 'HR-1004',
      name: 'Yaa Antwi',
      email: 'yaa.antwi@example.com',
      phone: '+233 500 777 888',
      role: 'Talent Acquisition Intern',
      status: 'received',
      appliedAt: '2026-07-20T11:50:00.000Z',
      updatedAt: '2026-07-20T11:50:00.000Z',
      interviewDate: '',
      notes: 'Recently submitted application. Pending initial screening.',
      history: [
        { stage: 'received', at: '2026-07-20T11:50:00.000Z', note: 'Application received.' }
      ]
    }
  ];
}

function serializeApplication(application) {
  return {
    ...application,
    history: JSON.stringify(application.history)
  };
}

function deserializeApplication(row) {
  return {
    ...row,
    history: JSON.parse(row.history)
  };
}

function listApplications(searchParams) {
  const stage = String(searchParams.get('stage') || 'all');
  const search = String(searchParams.get('search') || '').trim().toLowerCase();

  const rows = db.prepare('SELECT * FROM applications ORDER BY updatedAt DESC').all().map(deserializeApplication);
  return rows.filter((application) => {
    const matchesStage = stage === 'all' || application.status === stage;
    const matchesSearch = !search || [application.id, application.name, application.email, application.phone, application.role]
      .some((field) => String(field).toLowerCase().includes(search));
    return matchesStage && matchesSearch;
  });
}

function buildSummary() {
  const applications = db.prepare('SELECT status FROM applications').all();
  const count = (status) => applications.filter((application) => application.status === status).length;
  const open = applications.filter((application) => application.status !== 'hired' && application.status !== 'rejected').length;

  return {
    open,
    received: count('received'),
    interviewing: count('interviewing'),
    hired: count('hired'),
    rejected: count('rejected')
  };
}

function lookupApplication(query) {
  if (!query) {
    return null;
  }

  const row = db.prepare('SELECT * FROM applications WHERE LOWER(id) = LOWER(?) OR LOWER(email) = LOWER(?) LIMIT 1').get(query, query);
  return row ? deserializeApplication(row) : null;
}

function createApplication(body) {
  const name = String(body.name || '').trim();
  const email = String(body.email || '').trim();
  const phone = String(body.phone || '').trim();
  const role = String(body.role || '').trim();
  const notes = String(body.notes || '').trim();

  if (!name || !email || !phone || !role) {
    throw new Error('Missing required fields');
  }

  const timestamp = new Date().toISOString();
  const id = nextApplicationId();
  const application = {
    id,
    name,
    email,
    phone,
    role,
    status: 'received',
    appliedAt: timestamp,
    updatedAt: timestamp,
    interviewDate: '',
    notes: notes || 'Awaiting HR review.',
    history: [
      { stage: 'received', at: timestamp, note: 'Application received.' }
    ]
  };

  db.prepare(`
    INSERT INTO applications (id, name, email, phone, role, status, appliedAt, updatedAt, interviewDate, notes, history)
    VALUES (@id, @name, @email, @phone, @role, @status, @appliedAt, @updatedAt, @interviewDate, @notes, @history)
  `).run(serializeApplication(application));

  return application;
}

function updateApplication(id, body) {
  const existing = lookupApplication(id);
  if (!existing) {
    return null;
  }

  const action = String(body.action || 'advance');
  const application = JSON.parse(JSON.stringify(existing));
  const timestamp = new Date().toISOString();

  if (action === 'advance') {
    const stageOrder = ['received', 'shortlisted', 'interviewing', 'offer', 'hired'];
    const index = stageOrder.indexOf(application.status);
    const nextStage = index >= 0 && index < stageOrder.length - 1 ? stageOrder[index + 1] : application.status;
    application.status = nextStage;
    application.history.push({ stage: nextStage, at: timestamp, note: `Moved to ${prettyStage(nextStage)}.` });
    if (nextStage === 'interviewing' && !application.interviewDate) {
      application.interviewDate = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    }
    if (nextStage === 'hired') {
      application.notes = `${application.notes || ''} Candidate accepted the offer.`.trim();
    }
  } else if (action === 'reject') {
    application.status = 'rejected';
    application.history.push({ stage: 'rejected', at: timestamp, note: 'Marked as rejected by HR.' });
    application.notes = `${application.notes || ''} Candidate was rejected.`.trim();
  } else if (action === 'interview') {
    const interviewDate = String(body.interviewDate || '').trim();
    if (!interviewDate) {
      throw new Error('Interview date is required');
    }
    application.interviewDate = interviewDate;
    if (application.status === 'received') {
      application.status = 'interviewing';
      application.history.push({ stage: 'interviewing', at: timestamp, note: `Interview scheduled for ${interviewDate}.` });
    } else {
      application.history.push({ stage: application.status, at: timestamp, note: `Interview date updated to ${interviewDate}.` });
    }
    application.notes = `${application.notes || ''} Interview scheduled for ${interviewDate}.`.trim();
  } else {
    throw new Error('Unsupported action');
  }

  application.updatedAt = timestamp;

  db.prepare(`
    UPDATE applications
    SET name = @name,
        email = @email,
        phone = @phone,
        role = @role,
        status = @status,
        appliedAt = @appliedAt,
        updatedAt = @updatedAt,
        interviewDate = @interviewDate,
        notes = @notes,
        history = @history
    WHERE id = @id
  `).run(serializeApplication(application));

  return application;
}

function nextApplicationId() {
  const row = db.prepare("SELECT id FROM applications WHERE id LIKE 'HR-%' ORDER BY CAST(SUBSTR(id, 4) AS INTEGER) DESC LIMIT 1").get();
  if (!row) {
    return 'HR-1001';
  }

  const number = Number(String(row.id).slice(3));
  return `HR-${String(number + 1)}`;
}

function prettyStage(stage) {
  return {
    received: 'Received',
    shortlisted: 'Shortlisted',
    interviewing: 'Interviewing',
    offer: 'Offer',
    hired: 'Hired',
    rejected: 'Rejected'
  }[stage] || stage;
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => {
      if (chunks.length === 0) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      } catch (error) {
        reject(error);
      }
    });
    req.on('error', reject);
  });
}

function sendJson(res, statusCode, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body)
  });
  res.end(body);
}

function serveFile(res, filePath) {
  const fileBuffer = fs.readFileSync(filePath);
  const contentType = CONTENT_TYPES[path.extname(filePath).toLowerCase()] || 'application/octet-stream';
  res.writeHead(200, {
    'Content-Type': contentType,
    'Content-Length': fileBuffer.length
  });
  res.end(fileBuffer);
}