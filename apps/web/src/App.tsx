import { useEffect, useState, type ReactNode } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, Navigate, Route, Routes, useLocation, useNavigate, useParams } from 'react-router-dom'
import { ArrowRight, CircleHelp, FileCheck2, Landmark, Sparkles, UserRound } from 'lucide-react'
import { api, aud } from './api'
import type { Application, ApplicationDetails, Declarations, Disbursement, DocumentReview, DocumentType } from './types'

const types: DocumentType[] = ['drivers_licence', 'payslip', 'bank_statement']
const labels: Record<DocumentType, string> = { drivers_licence: 'Identity', payslip: 'Income', bank_statement: 'Bank statements' }
const humanize = (s: string) => s.replaceAll('_', ' ')
const processed = (app: Application, type: DocumentType) => app.documents.some(d => d.type === type && (d.status === 'processed' || d.status === 'needs_review'))
const editable = (app: Application) => ['documents_required', 'processing', 'needs_review', 'ready_to_submit'].includes(app.status)

export function App() {
  const { pathname } = useLocation()
  useEffect(() => { window.scrollTo(0, 0) }, [pathname])
  return <><header className="site-header"><Link className="brand" to="/">NewCredit</Link><a className="help" href="mailto:help@example.invalid"><CircleHelp /> Help</a></header><main><Routes>
    <Route path="/" element={<Start />} /><Route path="/login" element={<Login />} />
    <Route path="/applications/:id/documents" element={<DocumentIntake />} />
    <Route path="/applications/:id/document-review" element={<Review />} />
    <Route path="/applications/:id/review" element={<Review />} />
    <Route path="/applications/:id/outcome" element={<Outcome />} />
    <Route path="/applications/:id/offer" element={<Offer />} />
    <Route path="*" element={<Navigate to="/" replace />} />
  </Routes></main><footer>NewCredit demonstration · Synthetic data only</footer></>
}
function Page({ children }: { children: ReactNode }) { return <div className="page page-narrow">{children}</div> }
function Notice() { return <div className="notice" role="note"><Sparkles /><div><strong>Simulation only</strong> — Synthetic data only. Do not enter real personal information.</div></div> }
function ErrorMessage({ error }: { error: Error | null }) { return error ? <div className="error" role="alert">{error.message}</div> : null }
function Loading() { return <div className="loading" role="status">Loading…</div> }
function Start() {
  const navigate = useNavigate()
  const begin = useMutation({ mutationFn: () => api.createApplication('new'), onSuccess: app => navigate(`/applications/${app.id}/documents`) })
  return <div className="start-wrap"><section className="hero"><div className="eyebrow">Personal loan demonstration</div><h1>A clear view of your loan application</h1><p className="lead">Start with an empty application. Your synthetic documents and declarations provide the evidence for an indicative assessment.</p><Notice /><h2>How would you like to continue?</h2><div className="customer-choices"><button className="choice" disabled={begin.isPending} onClick={() => begin.mutate()}><UserRound /><span><strong>New customer</strong><small>Start a new application</small></span><ArrowRight /></button><Link className="choice" to="/login"><Landmark /><span><strong>Existing customer</strong><small>Use a simulated login</small></span><ArrowRight /></Link></div><ErrorMessage error={begin.error} /></section><aside className="preview-card"><FileCheck2 /><h2>Document-driven assessment</h2><p>Supply identity, two months of payslips and three full calendar months of statements for all accounts.</p><p>Sample packs are test inputs, not a choice of outcome.</p></aside></div>
}
function Login() {
  const navigate = useNavigate()
  const login = useMutation({ mutationFn: api.login })
  const begin = useMutation({ mutationFn: () => api.createApplication('existing'), onSuccess: app => navigate(`/applications/${app.id}/documents`) })
  return <Page><section className="login-card"><h1>Simulated login</h1><Notice /><p>This demo does not verify identity. Identity documents are required for both new and existing customers.</p>{login.data ? <><h2>{login.data.customerName}</h2><p>{login.data.customerReference}</p><p>{login.data.notice}</p><button className="button primary" disabled={begin.isPending} onClick={() => begin.mutate()}>Continue application</button></> : <button className="button primary" disabled={login.isPending} onClick={() => login.mutate()}>Log in to demo profile</button>}<ErrorMessage error={login.error || begin.error} /></section></Page>
}

function Evidence({ data }: { data: DocumentReview }) {
  return <section className="card"><h2>Document checks and sources</h2><p>Text-only extraction and consistency checks do not establish document authenticity.</p>
    {data.blockers.length > 0 && <div className="error"><h3>Document blockers</h3><ul>{data.blockers.map((b, i) => <li key={i}><strong>{humanize(b.check)}</strong>: {b.details}</li>)}</ul></div>}
    <details><summary>All checks ({data.checks.length})</summary><ul>{data.checks.map((c, i) => <li key={i}>{humanize(c.check)} — {c.status}: {c.details}</li>)}</ul></details>
    <details><summary>Extracted fields and provenance ({data.extractedFields.length})</summary><dl className="extracted-grid">{data.extractedFields.map(f => <div key={f.id}><dt>{humanize(f.fieldName)}</dt><dd>{f.normalizedValue ?? f.rawValue}</dd><small>Raw: {f.rawValue} · Document {f.documentId} · Labelled PDF text extraction{f.reviewRequired ? ' · Needs review' : ''}</small></div>)}</dl></details>
  </section>
}
function Figures({ app }: { app: Application }) {
  return app.review ? <section className="card"><h2>Evidence-derived figures</h2><dl className="detail-grid"><Item term="Monthly net income" value={aud(app.review.monthlyNetIncome)} /><Item term="Assessed living expenses" value={aud(app.review.assessedLivingExpenses)} /><Item term="Monthly housing" value={aud(app.review.monthlyHousing)} /><Item term="Classified transactions" value={String(app.review.classifiedTransactionCount)} /></dl></section> : null
}
function Item({ term, value }: { term: string; value: string }) { return <div><dt>{term}</dt><dd>{value}</dd></div> }
function DocumentIntake() {
  const { id = '' } = useParams(); const client = useQueryClient()
  const [pack, setPack] = useState('scenario-a')
  const app = useQuery({ queryKey: ['application', id], queryFn: () => api.application(id) })
  const requirements = useQuery({ queryKey: ['requirements', id], queryFn: () => api.documentRequirements(id) })
  const review = useQuery({ queryKey: ['document-review', id], queryFn: () => api.documentReview(id) })
  const refresh = async () => { await Promise.all([client.invalidateQueries({ queryKey: ['application', id] }), requirements.refetch(), review.refetch()]) }
  if (app.isLoading || requirements.isLoading || review.isLoading) return <Loading />
  if (!app.data || !requirements.data || !review.data) return <Page><ErrorMessage error={app.error || requirements.error || review.error} /></Page>
  return <Page><Notice /><div className="page-intro"><h1>Your documents</h1><p>Upload synthetic PDF, JPEG or PNG files. Text PDFs are recommended for extraction. File counts are minimums, not limits; supply complete periods and all accounts.</p></div><section className="card pack-card"><div><h2>Optional synthetic test input</h2><label>Sample pack <select value={pack} onChange={e => setPack(e.target.value)}>{['a', 'b', 'c', 'h'].map(p => <option key={p} value={`scenario-${p}`}>Sample pack {p.toUpperCase()}</option>)}</select></label><p>Independent of your application. No result is promised. Or upload your own synthetic files.</p></div><a className="button secondary" href={api.documentPackUrl(id, pack)} download>Download sample ZIP</a></section><div className="stack">{types.map((type, index) => <DocumentStage key={type} id={id} type={type} app={app.data!} text={requirements.data!.requirements.find(r => r.type === type)?.text ?? ''} unlocked={types.slice(0, index).every(t => processed(app.data!, t))} refresh={refresh} />)}<Figures app={app.data} /><Evidence data={review.data} />{types.every(t => processed(app.data!, t)) && <Link className="button primary" to={`/applications/${id}/review`}>Continue to review <ArrowRight /></Link>}</div></Page>
}
function DocumentStage({ id, type, app, text, unlocked, refresh }: { id: string; type: DocumentType; app: Application; text: string; unlocked: boolean; refresh: () => Promise<void> }) {
  const [files, setFiles] = useState<File[]>([]); const [inputKey, setInputKey] = useState(0)
  const [progress, setProgress] = useState('')
  const evidence = useQuery({ queryKey: ['document-review', id], queryFn: () => api.documentReview(id) })
  const docs = app.documents.filter(d => d.type === type)
  const fields = evidence.data?.extractedFields.filter(f => docs.some(d => d.id === f.documentId)) ?? []
  const action = useMutation({ mutationFn: async () => { for (const file of files) { setProgress(`Uploading ${file.name}…`); await api.uploadDocument(id, type, file) }; setProgress('Reading document text and checking consistency…'); await api.processDocuments(id, type) }, onSuccess: () => { setFiles([]); setInputKey(k => k + 1); setProgress('Processing complete. Review the extracted values below.') }, onError: () => setProgress('Processing could not complete. Check the error below.'), onSettled: refresh })
  const remove = useMutation({ mutationFn: (documentId: string) => api.removeDocument(id, documentId), onSettled: refresh })
  return <section className={`card intake-stage ${unlocked ? 'active' : 'locked'}`}>
    <header><span className="stage-number">{types.indexOf(type) + 1}</span><div><h2>{labels[type]}</h2><p>{text}</p><small>{processed(app, type) ? 'Processed evidence available; add/replace documents as needed.' : 'At least one processed document is needed to continue.'}</small></div></header>
    {editable(app) && unlocked ? <form className="stage-upload" onSubmit={e => { e.preventDefault(); action.mutate() }}>
      <label htmlFor={`files-${type}`}>Add/replace {labels[type].toLowerCase()} documents</label><input key={inputKey} id={`files-${type}`} type="file" accept="application/pdf,image/jpeg,image/png,.pdf,.jpeg,.jpg,.png" multiple onChange={e => setFiles(Array.from(e.target.files ?? []))} />
      <p>{files.length} selected · {docs.length} uploaded</p><button className="button primary" disabled={action.isPending || remove.isPending || (!files.length && !docs.some(d => d.status === 'uploaded'))}>Upload and process {labels[type].toLowerCase()}</button><p>To replace evidence, remove the old document and add its replacement.</p>
    </form> : !unlocked && <p className="locked-note">Process the previous stage first.</p>}
    {(docs.length > 0 || progress || action.error || remove.error) && <div className="stage-results">
      {progress && <p role="status" aria-live="polite">{progress}</p>}
      <ul className="documents">{docs.map((d, i) => <li key={d.id}><span><strong>{d.issuer || `Document ${i + 1}`}</strong><small>{d.periodStart} {d.periodEnd} · {humanize(d.status)}</small></span>{editable(app) && <button className="text-button" disabled={action.isPending || remove.isPending} aria-label={`Remove ${labels[type]} document ${i + 1}`} onClick={() => remove.mutate(d.id)}>Remove</button>}</li>)}</ul>
      {fields.length > 0 && <div><h3>What we found</h3><dl className="detail-grid">{fields.map(f => <Item key={f.id} term={humanize(f.fieldName)} value={f.normalizedValue ?? f.rawValue} />)}</dl><p>Extracted from your uploaded text PDFs; review these values before submitting.</p></div>}
      <ErrorMessage error={action.error || remove.error} />
    </div>}
  </section>
}

const defaultDeclarations: Declarations = { adults: 1, dependants: 0, inWorkforce: false, declaredLivingMinor: 0, declaredHousingMinor: 0, declaredDebtRepaymentsMinor: 0, otherCommitmentsMinor: 0, assetsMinor: 0, liabilitiesMinor: 0, allAccountsConfirmed: false, incomeContinuing: false, foreseeableChanges: '', confirmed: false, classifications: {} }
const moneyFields = { declaredLivingMinor: 'Monthly living expenses', declaredHousingMinor: 'Monthly housing costs', declaredDebtRepaymentsMinor: 'Monthly debt repayments', otherCommitmentsMinor: 'Monthly other commitments', assetsMinor: 'Assets', liabilitiesMinor: 'Liabilities' } as const
const categories = ['living', 'housing', 'debt', 'short_term_credit', 'gambling', 'salary', 'refund']
function Review() {
  const { id = '' } = useParams()
  const app = useQuery({ queryKey: ['application', id], queryFn: () => api.application(id) })
  const review = useQuery({ queryKey: ['document-review', id], queryFn: () => api.documentReview(id) })
  if (app.isLoading || review.isLoading) return <Loading />
  if (!app.data || !review.data) return <Page><ErrorMessage error={app.error || review.error} /></Page>
  return <Page><Notice /><h1>Check your application</h1><div className="stack"><Link className="button secondary" to={`/applications/${id}/documents`}>Return / add / replace / remove documents</Link><Evidence data={review.data} /><section className="card"><h2>Extracted applicant details</h2><dl className="detail-grid"><Item term="Name" value={app.data.customer.name || 'Not yet extracted'} /><Item term="Date of birth" value={app.data.customer.dateOfBirth || 'Not yet extracted'} /><Item term="Address" value={app.data.customer.address || 'Not yet extracted'} /><Item term="Employer" value={app.data.customer.employer || 'Not yet extracted'} /></dl></section><Figures app={app.data} /><DetailsForm key={id} app={app.data} /></div></Page>
}
function DetailsForm({ app }: { app: Application }) {
  const client = useQueryClient(); const navigate = useNavigate()
  const [form, setForm] = useState<ApplicationDetails>(() => ({ loan: { amountMinor: app.loan.amount.amountMinor, termYears: app.loan.termYears, purposeDetail: app.loan.purposeDetail }, customer: { email: app.customer.email, phone: app.customer.phone }, declarations: { ...defaultDeclarations, ...app.declarations, confirmed: false, classifications: { ...app.declarations?.classifications } } }))
  const [confirmed, setConfirmed] = useState(false); const [dirty, setDirty] = useState(true)
  const edit = (next: ApplicationDetails) => { setForm({ ...next, declarations: { ...next.declarations, confirmed: false } }); setConfirmed(false); setDirty(true) }
  const declare = (patch: Partial<Declarations>) => edit({ ...form, declarations: { ...form.declarations, ...patch } })
  const save = useMutation({ mutationFn: () => api.saveDetails(app.id, form), onSuccess: async data => { client.setQueryData(['application', app.id], data); setDirty(false); setConfirmed(false); await client.invalidateQueries({ queryKey: ['document-review', app.id] }) } })
  const submit = useMutation({ mutationFn: () => api.submit(app.id), onSuccess: () => navigate(`/applications/${app.id}/outcome`) })
  const disabled = !editable(app) || save.isPending || submit.isPending
  return <><form className="card details-form" onSubmit={e => { e.preventDefault(); save.mutate() }}>
    <h2>Review your pre-filled application</h2>
    <p>We have filled in what your documents tell us. Check the details and amounts, change anything that is not right, then confirm below. Saved corrections are kept when documents change.</p>
    <fieldset disabled={disabled}>
      <h3>Your loan and contact details</h3><p>These are not in your identity, payslip or statement documents. Confirm the requested loan and add your purpose, email and phone.</p>
      <div className="detail-grid">
        <label>Loan amount ($)<input type="number" min="5000" max="100000" step="1" required value={form.loan.amountMinor / 100 || ''} onChange={e => edit({ ...form, loan: { ...form.loan, amountMinor: Math.round(Number(e.target.value) * 100) } })} /></label>
        <label>Term (whole years)<input type="number" min="1" max="5" step="1" required value={form.loan.termYears || ''} onChange={e => edit({ ...form, loan: { ...form.loan, termYears: Number(e.target.value) } })} /></label>
        <label>Purpose detail<textarea required maxLength={500} value={form.loan.purposeDetail} onChange={e => edit({ ...form, loan: { ...form.loan, purposeDetail: e.target.value } })} /></label>
        {(['email', 'phone'] as const).map(key => <label key={key}>{key === 'email' ? 'Email' : 'Phone'}<input required type={key === 'email' ? 'email' : 'tel'} value={form.customer[key]} onChange={e => edit({ ...form, customer: { ...form.customer, [key]: e.target.value } })} /></label>)}
      </div>
      <h3>Your household</h3><p>Confirm the household assumptions; your documents do not establish these.</p>
      <div className="detail-grid">
        <label>Household adults<select value={form.declarations.adults} onChange={e => declare({ adults: Number(e.target.value) as 1 | 2 })}><option>1</option><option>2</option></select></label>
        <label>Dependants<select value={form.declarations.dependants} onChange={e => declare({ dependants: Number(e.target.value) })}>{[0, 1, 2, 3, 4].map(n => <option key={n}>{n}</option>)}</select></label>
      </div>
      <h3>Check the figures from your statements</h3>
      <p>Monthly living expenses, housing and debt repayments start with three-month statement averages, not the living-expense benchmark. Cash and unknown debits are included in living expenses until clarified. Add any costs your statements do not show.</p>
      <p>Assets start with the latest positive closing balance per account; liabilities start with observed overdrafts only. Add other assets and outstanding loan or credit-card balances. A zero means none found, not that you have none.</p>
      <div className="detail-grid">{Object.entries(moneyFields).map(([key, title]) => <label key={key}>{title} ($)<input type="number" min="0" step="0.01" required value={form.declarations[key as keyof typeof moneyFields] / 100} onChange={e => declare({ [key]: Math.round(Number(e.target.value) * 100) })} /></label>)}</div>
      {(['inWorkforce', 'allAccountsConfirmed', 'incomeContinuing'] as const).map((key, i) => <label className="check" key={key}><input type="checkbox" checked={form.declarations[key]} onChange={e => declare({ [key]: e.target.checked })} />{['I am in the workforce', 'I have supplied all accounts', 'My income is continuing'][i]}</label>)}
      <label>Foreseeable changes (enter “None” if none)<textarea required value={form.declarations.foreseeableChanges} onChange={e => declare({ foreseeableChanges: e.target.value })} /></label>
      <h3>Transactions and applicant classifications</h3><p>Only unclassified or cash transactions can be classified here. Overrides are applicant-confirmed, not independently verified.</p><div className="transaction-table"><table><thead><tr><th>Date / account</th><th>Description / source</th><th>Amount / balance</th><th>Category</th></tr></thead><tbody>{(app.transactions ?? []).map(tx => {
    const override = form.declarations.classifications[tx.id]
    const canClassify = /^(unclassified_debit|unclassified_credit|cash|cash_withdrawal|cash_deposit)$/.test(tx.category) || Boolean(override)
    return <tr key={tx.id}><td>{tx.date}<br />{tx.account}</td><td>{tx.description}<details><summary>Source</summary>Transaction {tx.id} · Document {tx.documentId}</details></td><td>{aud({ amountMinor: tx.amountMinor })}<br />Balance {aud({ amountMinor: tx.balanceMinor })}</td><td>{canClassify ? <label>Classify {tx.description}<select value={override ?? ''} onChange={e => { const classifications = { ...form.declarations.classifications }; if (e.target.value) classifications[tx.id] = e.target.value; else delete classifications[tx.id]; declare({ classifications }) }}><option value="">{humanize(tx.category)} (no override)</option>{categories.filter(c => tx.amountMinor > 0 ? ['salary', 'refund'].includes(c) : !['salary', 'refund'].includes(c)).map(c => <option key={c} value={c}>{humanize(c)}</option>)}</select></label> : humanize(tx.category)}{override && <small>Applicant-confirmed: {humanize(override)}</small>}</td></tr>
  })}</tbody></table></div><label className="check"><input type="checkbox" checked={form.declarations.confirmed} onChange={e => { setForm({ ...form, declarations: { ...form.declarations, confirmed: e.target.checked } }); setConfirmed(false); setDirty(true) }} />I explicitly confirm these applicant details, declarations and classifications</label><button className="button primary" disabled={!form.declarations.confirmed || save.isPending}>Save details and declarations</button></fieldset><ErrorMessage error={save.error} />{save.isSuccess && !dirty && <p role="status">Details saved. Submission readiness is determined by the document and declaration checks.</p>}</form><aside className="summary"><h2>Review and submit</h2><p>Status: {humanize(app.status)}</p>{app.status !== 'ready_to_submit' && <p>Submission is unavailable until complete, consistent document coverage and all required declarations are accepted. Resolve document blockers above and check your details.</p>}<label className="check"><input type="checkbox" checked={confirmed} disabled={dirty || disabled} onChange={e => setConfirmed(e.target.checked)} />I confirm submission of this synthetic application</label><button className="button primary" disabled={dirty || !confirmed || app.status !== 'ready_to_submit' || !types.every(t => processed(app, t)) || disabled} onClick={() => submit.mutate()}>Submit for indicative outcome</button><ErrorMessage error={submit.error} /></aside></>
}
function Outcome() {
  const { id = '' } = useParams()
  const query = useQuery({ queryKey: ['outcome', id], queryFn: () => api.outcome(id) })
  if (query.isLoading) return <Loading />
  if (!query.data) return <Page><ErrorMessage error={query.error} /></Page>
  const data = query.data
  return <Page><Notice /><div className="outcome-heading"><div className="eyebrow">Indicative outcome</div><h1>{data.decision === 'indicatively_approved' ? 'Your application is indicatively approved' : data.decision === 'referred' ? 'Your application has been referred' : 'Your application is not approved'}</h1><p>Not a real credit decision. No credit record is affected.</p></div><section className="card score"><h2>Assessment summary</h2><div className="score-row"><div><span>Risk score</span><strong>{data.riskScore}</strong><small>{humanize(data.riskBand)} risk band · scale 1–1000</small></div><div><span>Affordability</span><strong>{humanize(data.affordability)}</strong><small>{aud(data.monthlySurplus)} estimated monthly capacity</small></div></div><h3>Reasons</h3><ul>{data.reasons.map(r => <li key={r}>{humanize(r)}</li>)}</ul><h3>Assessment signals</h3><ul className="factor-grid">{(data.factors ?? []).map((f, i) => <li key={i}><strong>{humanize(f.factor)}</strong><span>{f.signal}</span><small>Risk contribution: {f.riskValue}</small></li>)}</ul></section>{data.decision === 'indicatively_approved' ? <section className="warm-panel"><p>Your simulated offer is available. This is not an offer of credit.</p><Link className="button primary" to={`/applications/${id}/offer`}>Review simulated offer</Link></section> : <section className="terminal-panel"><div><h2>No offer or funds movement is available</h2><p>{data.decision === 'referred' ? 'Further review would be required; referral is not a decline.' : 'No offer was created for this assessment.'}</p></div></section>}</Page>
}
function Offer() {
  const { id = '' } = useParams(); const client = useQueryClient(); const [funding, setFunding] = useState<Disbursement | null>(null)
  const offer = useQuery({ queryKey: ['offer', id], queryFn: () => api.offer(id) })
  const accept = useMutation({ mutationFn: api.accept, onSuccess: data => client.setQueryData(['offer', id], data) })
  const disburse = useMutation({ mutationFn: api.disburse, onSuccess: setFunding })
  if (offer.isLoading) return <Loading />
  if (!offer.data) return <Page><ErrorMessage error={offer.error} /></Page>
  if (funding) return <Page><Notice /><section className="funded"><h1>Simulated funding complete</h1><p>{aud(funding.amount)} · {funding.destinationAccountMasked}</p><p>Reference {funding.transferReference}</p><p>{funding.simulationNotice}</p><strong>No money was transferred. No real loan was created.</strong><Link className="button secondary" to="/">Return to start</Link></section></Page>
  const data = offer.data
  return <Page><Notice /><h1>Review your offer</h1><p>Accepting this simulation does not create a real loan.</p><section className="offer-card"><div className="offer-principal"><span>Loan amount</span><strong>{aud(data.principal)}</strong><small>{data.termYears}-year term</small></div><dl className="offer-facts"><Item term="Interest rate" value={`${(data.annualRateBasisPoints / 100).toFixed(1)}% p.a.`} /><Item term="Monthly fee" value={aud(data.monthlyFee)} /><Item term="Monthly repayment" value={aud(data.monthlyRepayment)} /><Item term="Total repayable" value={aud(data.totalRepayable)} /></dl></section><section className="card acceptance"><h2>{data.status === 'ready' ? 'Accept this simulated offer?' : 'Offer accepted'}</h2><p>Destination: {data.destinationAccountMasked}</p><p>{data.simulationNotice}</p>{data.status === 'ready' ? <button className="button primary" disabled={accept.isPending} onClick={() => accept.mutate(data.id)}>Accept simulated offer</button> : data.status === 'accepted' ? <button className="button primary" disabled={disburse.isPending} onClick={() => disburse.mutate(data.id)}>Simulate funding</button> : <p>Simulated funding completed.</p>}<ErrorMessage error={accept.error || disburse.error} /></section></Page>
}
