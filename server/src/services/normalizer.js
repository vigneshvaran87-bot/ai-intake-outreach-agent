export function normalizeLead(row) {
  const sourceId = String(row.lead_id || '').trim();
  const display = String(row.full_name || '').trim();
  if (!sourceId || !display) throw new Error('Lead row is missing lead_id or full_name');
  const parts = display.split(/\s+/);
  const activity = String(row.recent_activity || '').trim();
  const note = String(row.connection_note || '').trim();
  const text = `${activity} ${note}`.toLowerCase();
  const priority = /requested demo|pricing|ready to buy|book a call|follow.?up urgently/.test(text) ? 'high' : /liked|commented|webinar|connection request|downloaded/.test(text) ? 'medium' : 'low';
  return {
    source: 'lead', sourceId,
    name: { given: parts.slice(0, -1).join(' ') || parts[0], family: parts.length > 1 ? parts.at(-1) : '', display },
    contact: { email: null, phone: null },
    context: { summary: [row.job_title, row.company, activity, note].filter(Boolean).join(' — '), industry: row.industry || '', location: row.location || '', details: { jobTitle: row.job_title || '', company: row.company || '', companySize: row.company_size || '', headline: row.linkedin_headline || '' } },
    signals: { priority, tags: [row.industry, row.job_title].filter(Boolean) }, rawPayload: row, status: 'pending'
  };
}

export function normalizeFhirPatient(patient) {
  const sourceId = String(patient?.id || '').trim();
  if (!sourceId) throw new Error('FHIR Patient resource is missing id');
  const nameObj = Array.isArray(patient.name) ? patient.name.find(n => n?.text || n?.given || n?.family) || {} : {};
  const given = Array.isArray(nameObj.given) ? nameObj.given.join(' ') : (nameObj.given || '');
  const family = nameObj.family || '';
  const display = nameObj.text || [given, family].filter(Boolean).join(' ') || `Synthetic patient ${sourceId}`;
  const telecom = Array.isArray(patient.telecom) ? patient.telecom : [];
  const email = telecom.find(t => t.system === 'email')?.value || null;
  const phone = telecom.find(t => t.system === 'phone')?.value || null;
  const address = Array.isArray(patient.address) ? patient.address[0] : null;
  const location = address ? [address.city, address.state, address.country].filter(Boolean).join(', ') : '';
  return {
    source: 'fhir_patient', sourceId,
    name: { given, family, display }, contact: { email, phone },
    context: { summary: `Synthetic FHIR Patient resource. Administrative outreach draft only; no clinical urgency inferred. Gender: ${patient.gender || 'not recorded'}.`, industry: 'Healthcare', location, details: { gender: patient.gender || null, birthDate: patient.birthDate || null, active: patient.active ?? null, resourceType: patient.resourceType || 'Patient' } },
    signals: { priority: 'low', tags: ['FHIR', 'synthetic', 'review-required'] }, rawPayload: patient, status: 'pending'
  };
}
