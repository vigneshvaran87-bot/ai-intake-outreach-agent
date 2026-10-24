import React, { useCallback, useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { Badge, Button, Card, Col, Container, Form, Modal, Nav, Row, Spinner, Table, Toast, ToastContainer } from 'react-bootstrap';

const api = axios.create({ baseURL: import.meta.env.VITE_API_BASE_URL || 'http://localhost:8080/api', timeout: 30000 });
const fmt = value => value ? new Date(value).toLocaleString() : '—';
const badgeVariant = value => ({ pending: 'secondary', processed: 'success', failed: 'danger', high: 'danger', medium: 'warning', low: 'secondary', delivered: 'success', completed: 'success', fallback: 'warning' }[value] || 'primary');

function App() {
  const [records, setRecords] = useState([]);
  const [decisions, setDecisions] = useState([]);
  const [logs, setLogs] = useState([]);
  const [cms, setCms] = useState([]);
  const [health, setHealth] = useState(null);
  const [busy, setBusy] = useState('');
  const [toast, setToast] = useState(null);
  const [filter, setFilter] = useState('all');
  const [activeTab, setActiveTab] = useState('overview');
  const [selected, setSelected] = useState(null);
  const [uploadFile, setUploadFile] = useState(null);
  const [runSummary, setRunSummary] = useState(null);

  const refresh = useCallback(async () => {
    try {
      const [h, r, d, l, c] = await Promise.all([
        api.get('/health'), api.get('/records?limit=500'), api.get('/agent/runs'), api.get('/logs'), api.get('/cms/records')
      ]);
      setHealth(h.data); setRecords(r.data.records || []); setDecisions(d.data.decisions || []); setLogs(l.data.logs || []); setCms(c.data.records || []);
    } catch (error) { setHealth({ mongo: 'unavailable' }); }
  }, []);
  useEffect(() => { refresh(); }, [refresh]);

  const notify = (message, variant = 'success') => setToast({ message, variant });
  const action = async (key, fn, successText) => {
    setBusy(key);
    try { const result = await fn(); await refresh(); if (successText) notify(typeof successText === 'function' ? successText(result.data) : successText); return result.data; }
    catch (error) { notify(error.response?.data?.error || error.message || 'Request failed', 'danger'); return null; }
    finally { setBusy(''); }
  };
  const importSample = () => action('sample', () => api.post('/ingest/sample-csv'), d => `CSV import complete: ${d.imported} rows imported; ${d.skipped} skipped.`);
  const importFhir = () => action('fhir', () => api.post('/ingest/fhir', { limit: 20 }), d => `FHIR import complete: ${d.imported} imported, ${d.invalidEntries?.length || 0} malformed entries.`);
  const runAgent = async () => {
    const result = await action('agent', () => api.post('/agent/run', { limit: 150 }), d => `Agent run complete: ${d.processed} processed, ${d.delivered} delivered, ${d.deliveryFailed} delivery failures.`);
    if (result) setRunSummary(result);
  };
  const uploadCsv = async e => {
    e.preventDefault(); if (!uploadFile) return notify('Choose a CSV file first.', 'warning');
    const body = new FormData(); body.append('file', uploadFile);
    await action('upload', () => api.post('/ingest/csv', body, { headers: { 'Content-Type': 'multipart/form-data' } }), d => `Upload complete: ${d.imported} imported, ${d.skipped} skipped.`);
    setUploadFile(null); e.target.reset();
  };
  const failureTest = () => action('failure', () => api.post('/cms/failure-test').catch(e => { if (e.response?.data?.expectedFailure) { notify('Expected failure handled: malformed CMS payload rejected (HTTP 400).', 'warning'); return { data: e.response.data }; } throw e; }), null);

  const stats = useMemo(() => ({ total: records.length, leads: records.filter(r => r.source === 'lead').length, patients: records.filter(r => r.source === 'fhir_patient').length, processed: records.filter(r => r.status === 'processed').length, pending: records.filter(r => r.status === 'pending').length, delivered: logs.filter(l => l.status === 'delivered').length, failed: logs.filter(l => l.status === 'failed').length }), [records, logs]);
  const visibleRecords = records.filter(r => filter === 'all' || r.source === filter);
  const decisionFor = id => decisions.find(d => String(d.record?._id || d.record) === String(id));

  return <div className="app-shell">
    <aside className="sidebar">
      <div className="brand"><div className="brand-mark"><i className="bi bi-bezier2" /></div><div><strong>IntakeFlow</strong><small>AI OPERATIONS</small></div></div>
      <div className="workspace-label">WORKSPACE</div>
      <Nav className="flex-column nav-menu" activeKey={activeTab} onSelect={setActiveTab}>
        <Nav.Link eventKey="overview"><i className="bi bi-grid-1x2"/> Overview</Nav.Link>
        <Nav.Link eventKey="records"><i className="bi bi-person-lines-fill"/> Intake records <span className="nav-count">{stats.total}</span></Nav.Link>
        <Nav.Link eventKey="runs"><i className="bi bi-cpu"/> Agent decisions</Nav.Link>
        <Nav.Link eventKey="delivery"><i className="bi bi-send-check"/> CMS deliveries</Nav.Link>
        <Nav.Link eventKey="logs"><i className="bi bi-journal-text"/> Activity logs</Nav.Link>
      </Nav>
      <div className="sidebar-bottom"><div className="status-dot"/><div><strong>Local demo environment</strong><small>FHIR sandbox · synthetic data only</small></div></div>
    </aside>

    <main className="main-content">
      <header className="topbar"><div><div className="eyebrow">AUTOMATION WORKSPACE / DEMO</div><h1>{({ overview: 'Overview', records: 'Intake records', runs: 'Agent decisions', delivery: 'CMS deliveries', logs: 'Activity logs' })[activeTab]}</h1></div><div className="top-actions"><span className={`connection-pill ${health?.mongo === 'connected' ? 'online' : 'offline'}`}><span/> MongoDB {health?.mongo || 'checking'}</span><Button variant="light" className="icon-button" onClick={refresh} title="Refresh data"><i className="bi bi-arrow-clockwise"/></Button></div></header>
      <Container fluid className="page-body">
        {activeTab === 'overview' && <>
          <div className="welcome-row"><div><h2>Your intake pipeline, at a glance.</h2><p>Bring in lead and synthetic patient records, enrich them with an agent, and verify downstream delivery.</p></div><Badge bg="light" text="dark" className="demo-badge"><i className="bi bi-shield-check me-1"/> Synthetic-data demo</Badge></div>
          <Row className="g-3 stats-row">
            <StatCard title="Total records" value={stats.total} icon="bi-collection" tone="violet" foot="Across all connected sources"/>
            <StatCard title="Lead records" value={stats.leads} icon="bi-people" tone="blue" foot="Imported from CSV"/>
            <StatCard title="FHIR patients" value={stats.patients} icon="bi-heart-pulse" tone="teal" foot="Synthetic sandbox resources"/>
            <StatCard title="Delivered to CMS" value={stats.delivered} icon="bi-check2-circle" tone="green" foot={`${stats.failed} failed deliveries`} />
          </Row>
          <Row className="g-3 mt-1">
            <Col xl={7}>
              <Card className="panel-card h-100"><Card.Body>
                <div className="section-heading"><div><h3>Run the pipeline</h3><p>Execute each stage independently, then review the outcome.</p></div><span className="step-tag">3 STAGES</span></div>
                <div className="pipeline-list">
                  <PipelineStep number="01" title="Ingest lead CSV" description="Import the included 18 lead records or upload your own CSV." icon="bi-file-earmark-spreadsheet" buttonText="Import sample CSV" busy={busy === 'sample'} onClick={importSample}/>
                  <PipelineStep number="02" title="Fetch synthetic FHIR patients" description="Fetch Patient resources from the public SMART Health IT R4 sandbox." icon="bi-hospital" buttonText="Fetch patients" busy={busy === 'fhir'} onClick={importFhir}/>
                  <PipelineStep number="03" title="Run agent & deliver" description="Classify pending records, draft messages, and post schema-validated payloads to the local CMS." icon="bi-stars" buttonText="Run agent" primary busy={busy === 'agent'} onClick={runAgent}/>
                </div>
                <div className="run-note"><i className="bi bi-info-circle"/><span>LLM key is optional. Without <code>GROQ_API_KEY</code>, the system uses a labelled rules fallback.</span></div>
              </Card.Body></Card>
            </Col>
            <Col xl={5}>
              <Card className="panel-card h-100"><Card.Body>
                <div className="section-heading"><div><h3>Quick upload</h3><p>Import another LinkedIn-style CSV export.</p></div><i className="bi bi-cloud-arrow-up upload-heading-icon"/></div>
                <Form onSubmit={uploadCsv} className="upload-form"><label className="drop-zone"><input type="file" accept=".csv,text/csv" onChange={e => setUploadFile(e.target.files?.[0] || null)}/><i className="bi bi-file-earmark-arrow-up"/><strong>{uploadFile ? uploadFile.name : 'Choose a CSV file'}</strong><span>{uploadFile ? `${(uploadFile.size / 1024).toFixed(1)} KB selected` : 'CSV format · Maximum 2 MB'}</span></label><Button type="submit" variant="outline-primary" disabled={busy === 'upload' || !uploadFile} className="w-100 mt-3">{busy === 'upload' ? <Spinner size="sm"/> : <i className="bi bi-upload me-2"/>} Upload and import</Button></Form>
                <div className="divider-line"/><div className="mini-stat-row"><div><span>Awaiting agent</span><strong>{stats.pending}</strong></div><div><span>Processed</span><strong>{stats.processed}</strong></div><div><span>CMS failed</span><strong className={stats.failed ? 'text-danger' : ''}>{stats.failed}</strong></div></div>
              </Card.Body></Card>
            </Col>
          </Row>
          {runSummary && <Card className="panel-card mt-3"><Card.Body><div className="section-heading"><div><h3>Latest agent run</h3><p>Per-record result summary from the most recent run.</p></div><Button variant="link" onClick={() => setActiveTab('runs')}>View decisions <i className="bi bi-arrow-right"/></Button></div><Row className="g-2"><SummaryBox label="Selected" value={runSummary.selected}/><SummaryBox label="Processed" value={runSummary.processed}/><SummaryBox label="Delivered" value={runSummary.delivered}/><SummaryBox label="Delivery failures" value={runSummary.deliveryFailed}/></Row></Card.Body></Card>}
          <RecentRecords records={records.slice(0, 6)} decisionFor={decisionFor} onSelect={setSelected} onViewAll={() => setActiveTab('records')}/>
        </>}

        {activeTab === 'records' && <Card className="panel-card"><Card.Body><div className="section-heading wrap-heading"><div><h3>Normalized records</h3><p>Both sources share a common schema while preserving the source payload.</p></div><Form.Select value={filter} onChange={e => setFilter(e.target.value)} className="filter-select"><option value="all">All sources</option><option value="lead">CSV leads</option><option value="fhir_patient">FHIR patients</option></Form.Select></div><RecordTable records={visibleRecords} decisionFor={decisionFor} onSelect={setSelected}/></Card.Body></Card>}

        {activeTab === 'runs' && <Card className="panel-card"><Card.Body><div className="section-heading"><div><h3>Agent reasoning & decisions</h3><p>Classification, score, selected action, rationale, and LLM/fallback provider.</p></div><Badge bg="light" text="dark">{decisions.length} decisions</Badge></div>{decisions.length ? <div className="table-responsive"><Table hover className="data-table"><thead><tr><th>Record</th><th>Classification</th><th>Score</th><th>Action</th><th>Provider</th><th>Result</th></tr></thead><tbody>{decisions.map(d => <tr key={d._id} onClick={() => setSelected(d.record?._id)} className="click-row"><td><strong>{d.record?.name?.display || 'Record'}</strong><small>{d.record?.sourceId || ''}</small></td><td>{d.classification}</td><td><Score score={d.score}/></td><td>{d.action}</td><td><Badge bg={badgeVariant(d.status)}>{d.provider}</Badge></td><td><Badge bg={badgeVariant(d.status)}>{d.status}</Badge></td></tr>)}</tbody></Table></div> : <EmptyState icon="bi-cpu" title="No agent decisions yet" text="Import records and run the agent to populate this table."/>}</Card.Body></Card>}

        {activeTab === 'delivery' && <Card className="panel-card"><Card.Body><div className="section-heading"><div><h3>Mock CMS receipts</h3><p>These are actual HTTP responses from the local schema-validated CMS endpoint.</p></div><Button variant="outline-danger" size="sm" onClick={failureTest} disabled={busy === 'failure'}>{busy === 'failure' ? <Spinner size="sm"/> : <i className="bi bi-bug me-1"/>} Simulate failure test</Button></div>{cms.length ? <div className="table-responsive"><Table hover className="data-table"><thead><tr><th>Receipt ID</th><th>Record ID</th><th>Received at</th><th>Contract</th></tr></thead><tbody>{cms.map(item => <tr key={item.receiptId}><td><code>{item.receiptId}</code></td><td>{item.payload?.record?.id}</td><td>{fmt(item.receivedAt)}</td><td><Badge bg="success">Accepted · v{item.payload?.schemaVersion}</Badge></td></tr>)}</tbody></Table></div> : <EmptyState icon="bi-send" title="No CMS receipts yet" text="Run the agent to push structured payloads to the local CMS."/>}</Card.Body></Card>}

        {activeTab === 'logs' && <Card className="panel-card"><Card.Body><div className="section-heading"><div><h3>Delivery & observability logs</h3><p>Recent successful and failed downstream delivery attempts.</p></div><Badge bg="light" text="dark">{logs.length} events</Badge></div>{logs.length ? <div className="table-responsive"><Table hover className="data-table"><thead><tr><th>Status</th><th>Source ID</th><th>Destination</th><th>HTTP</th><th>Attempts</th><th>Timestamp</th><th>Error</th></tr></thead><tbody>{logs.map(l => <tr key={l._id}><td><Badge bg={badgeVariant(l.status)}>{l.status}</Badge></td><td>{l.sourceId}</td><td>{l.destination}</td><td>{l.httpStatus || '—'}</td><td>{l.attempts}</td><td>{fmt(l.createdAt)}</td><td className="error-cell">{l.error || '—'}</td></tr>)}</tbody></Table></div> : <EmptyState icon="bi-journal-text" title="No activity yet" text="Agent delivery attempts and errors will appear here."/>}</Card.Body></Card>}
        <footer className="footer-note"><span>IntakeFlow · MERN technical assignment demo</span><span><i className="bi bi-shield-lock me-1"/>No real patient data or automatic outreach</span></footer>
      </Container>
    </main>

    <Modal show={Boolean(selected)} onHide={() => setSelected(null)} size="lg" centered><Modal.Header closeButton><Modal.Title>Record details</Modal.Title></Modal.Header><Modal.Body>{selected && <RecordDetails id={selected} onError={message => notify(message, 'danger')}/>}</Modal.Body><Modal.Footer><Button variant="secondary" onClick={() => setSelected(null)}>Close</Button></Modal.Footer></Modal>
    <ToastContainer position="bottom-end" className="p-3"><Toast bg={toast?.variant || 'success'} show={Boolean(toast)} onClose={() => setToast(null)} delay={5500} autohide><Toast.Body className="text-white">{toast?.message}</Toast.Body></Toast></ToastContainer>
  </div>;
}

function StatCard({ title, value, icon, tone, foot }) { return <Col sm={6} xl={3}><Card className="stat-card"><Card.Body><div className="stat-top"><span>{title}</span><div className={`stat-icon ${tone}`}><i className={`bi ${icon}`}/></div></div><div className="stat-value">{value}</div><div className="stat-foot">{foot}</div></Card.Body></Card></Col>; }
function PipelineStep({ number, title, description, icon, buttonText, busy, onClick, primary }) { return <div className="pipeline-step"><div className="pipeline-number">{number}</div><div className="pipeline-icon"><i className={`bi ${icon}`}/></div><div className="pipeline-copy"><strong>{title}</strong><span>{description}</span></div><Button variant={primary ? 'primary' : 'outline-secondary'} size="sm" onClick={onClick} disabled={busy}>{busy ? <Spinner size="sm"/> : buttonText}</Button></div>; }
function SummaryBox({ label, value }) { return <Col sm={6} md={3}><div className="summary-box"><span>{label}</span><strong>{value}</strong></div></Col>; }
function Score({ score = 0 }) { return <div className="score-wrap"><div className="score-track"><div style={{ width: `${score}%` }}/></div><strong>{score}</strong></div>; }
function EmptyState({ icon, title, text }) { return <div className="empty-state"><i className={`bi ${icon}`}/><strong>{title}</strong><span>{text}</span></div>; }
function RecentRecords({ records, decisionFor, onSelect, onViewAll }) { return <Card className="panel-card mt-3"><Card.Body><div className="section-heading"><div><h3>Recently ingested</h3><p>Latest records across both sources.</p></div><Button variant="link" onClick={onViewAll}>View all records <i className="bi bi-arrow-right"/></Button></div>{records.length ? <RecordTable records={records} decisionFor={decisionFor} onSelect={onSelect}/> : <EmptyState icon="bi-inbox" title="Your pipeline is ready" text="Import the sample CSV or fetch synthetic FHIR patients to get started."/>}</Card.Body></Card>; }
function RecordTable({ records, decisionFor, onSelect }) { return <div className="table-responsive"><Table hover className="data-table"><thead><tr><th>Record</th><th>Source</th><th>Priority</th><th>Context</th><th>Agent</th><th>Status</th><th/></tr></thead><tbody>{records.map(r => { const d = decisionFor(r._id); return <tr key={r._id} className="click-row" onClick={() => onSelect(r._id)}><td><div className="record-name"><div className={`avatar ${r.source === 'lead' ? 'avatar-lead' : 'avatar-patient'}`}>{(r.name?.display || '?').slice(0, 1).toUpperCase()}</div><div><strong>{r.name?.display || 'Unnamed'}</strong><small>{r.sourceId}</small></div></div></td><td><Badge bg={r.source === 'lead' ? 'primary' : 'info'}>{r.source === 'lead' ? 'CSV lead' : 'FHIR patient'}</Badge></td><td><Badge bg={badgeVariant(r.signals?.priority)}>{r.signals?.priority || 'low'}</Badge></td><td className="context-cell">{r.context?.summary || '—'}</td><td>{d ? <Badge bg={badgeVariant(d.status)}>{d.classification}</Badge> : <span className="muted-text">Not run</span>}</td><td><Badge bg={badgeVariant(r.status)}>{r.status}</Badge></td><td><i className="bi bi-chevron-right row-chevron"/></td></tr>; })}</tbody></Table></div>; }
function RecordDetails({ id, onError }) { const [data, setData] = useState(null); useEffect(() => { let alive = true; api.get(`/records/${id}`).then(r => alive && setData(r.data)).catch(e => onError(e.response?.data?.error || e.message)); return () => { alive = false; }; }, [id]); if (!data) return <div className="py-4 text-center"><Spinner/></div>; const { record, decision, deliveries } = data; return <div className="detail-stack"><div className="detail-hero"><div className="avatar avatar-large">{record.name?.display?.slice(0, 1)}</div><div><h4>{record.name?.display}</h4><span>{record.sourceId} · {record.source}</span></div><Badge bg={badgeVariant(record.status)}>{record.status}</Badge></div><h6>Normalized context</h6><p className="detail-summary">{record.context?.summary || 'No context supplied.'}</p><Row className="g-2"><Col sm={6}><div className="detail-field"><span>Location</span><strong>{record.context?.location || '—'}</strong></div></Col><Col sm={6}><div className="detail-field"><span>Priority signal</span><strong>{record.signals?.priority || 'low'}</strong></div></Col><Col sm={6}><div className="detail-field"><span>Email</span><strong>{record.contact?.email || 'Not supplied'}</strong></div></Col><Col sm={6}><div className="detail-field"><span>Phone</span><strong>{record.contact?.phone || 'Not supplied'}</strong></div></Col></Row>{decision && <><h6 className="mt-3">Agent decision</h6><Row className="g-2"><Col sm={6}><div className="detail-field"><span>Classification / score</span><strong>{decision.classification} · {decision.score}/100</strong></div></Col><Col sm={6}><div className="detail-field"><span>Action / channel</span><strong>{decision.action} · {decision.channel}</strong></div></Col></Row><div className="rationale-box"><strong><i className="bi bi-lightbulb me-2"/>Rationale</strong><p>{decision.rationale}</p><small>Provider: {decision.provider}</small></div><h6 className="mt-3">Message / next-step draft</h6><blockquote className="message-draft">{decision.messageDraft}</blockquote></>}{deliveries?.length > 0 && <><h6 className="mt-3">Delivery attempts</h6>{deliveries.map(d => <div key={d._id} className="delivery-line"><Badge bg={badgeVariant(d.status)}>{d.status}</Badge><span>HTTP {d.httpStatus || '—'} · {d.attempts} attempt(s)</span><small>{fmt(d.createdAt)}</small></div>)}</>}{record.lastError && <div className="alert alert-warning mt-3 mb-0">{record.lastError}</div>}<details className="raw-details"><summary>View original source payload</summary><pre>{JSON.stringify(record.rawPayload, null, 2)}</pre></details></div>; }

export default App;
