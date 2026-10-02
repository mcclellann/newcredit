import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Navigate, Route, Routes, useNavigate, useParams } from 'react-router-dom'
import { ArrowRight, BadgeCheck, Banknote, Check, CheckCircle2, CircleHelp, FileCheck2, Landmark, LockKeyhole, ShieldCheck, Sparkles, UserRound } from 'lucide-react'
import { api, aud } from './api'
import type { Application, Disbursement } from './types'

const stages = ['Loan', 'About you', 'Documents', 'Review', 'Submit']
const reasonLabels: Record<string, string> = {
  stable_income: 'Regular salary income was verified', positive_cash_flow: 'Statements show stable positive cash flow',
  no_adverse_signals: 'No adverse transaction signals were identified', affordable: 'The assessed repayment is affordable',
  AFFORDABLE_STRONG_SURPLUS: 'Strong verified capacity after the proposed repayment',
  STABLE_POSITIVE_CASH_FLOW: 'Statements show stable positive cash flow',
  NO_OBSERVED_STRESS: 'No observed payment stress indicators',
  MODERATE_RISK_SCORE: 'The transaction-derived risk score is in the moderate band',
  RECURRING_DEBT_BURDEN: 'Recurring debt repayments use a material share of verified income',
  VARIABLE_CONTINUING_INCOME: 'Income is continuing but varies between weekly pay periods',
  PAYMENT_STRESS_OBSERVED: 'Payment-stress events were observed in the statement period',
}
const humanize = (value: string) => {
  const words = value.replace(/[._]/g, ' ').toLowerCase()
  return words.charAt(0).toUpperCase() + words.slice(1)
}
const factorDescriptions: Record<string, string> = {
  post_loan_capacity: 'The proposed repayment remains affordable, but with a narrower surplus than the lowest-risk profile.',
  payment_stress: 'Two dishonour or payment-stress events were observed during the statement period.',
  existing_debt_burden: 'Existing repayments of $2,100 a month use about 34% of verified income.',
  cash_flow_balance_stability: 'External cash flow stayed positive and no negative-balance days were observed.',
  income_stability: 'Weekly pay varied by about 32%, although the income is confirmed as continuing.',
  gambling_activity: 'One gambling transaction of $45 was observed during the statement period.',
  short_term_credit_use: 'Four short-term credit repayment events were observed.',
}
const factorLabels: Record<string, string> = { short_term_credit_use: 'Short-term credit use' }
const factorContribution = (riskValue: number) => riskValue === 0 ? 'Positive signal' : riskValue <= 25 ? 'Low contribution' : riskValue <= 50 ? 'Moderate contribution' : 'High contribution'

export function App() {
  return <Shell><Routes>
    <Route path="/" element={<Start />} />
    <Route path="/login" element={<Login />} />
    <Route path="/applications/:id/review" element={<Review />} />
    <Route path="/applications/:id/outcome" element={<Outcome />} />
    <Route path="/applications/:id/offer" element={<Offer />} />
    <Route path="*" element={<Navigate to="/" replace />} />
  </Routes></Shell>
}

function Shell({ children }: { children: ReactNode }) {
  return <><header className="site-header"><a className="brand" href="/" aria-label="NewCredit home"><span className="brand-mark">N</span>NewCredit</a><a className="help" href="mailto:help@example.invalid"><CircleHelp size={19} /> Help</a></header><main>{children}</main><footer><span>NewCredit demonstration</span><nav aria-label="Footer"><a href="/">Privacy</a><a href="/">Accessibility</a></nav></footer></>
}

function Notice({ full = false }: { full?: boolean }) {
  return <div className="notice" role="note"><Sparkles size={18} aria-hidden="true" /><div><strong>Simulation only</strong><span>{full ? '—no money was transferred.' : ' — Synthetic data only. Do not enter real personal information.'}</span></div></div>
}

function ErrorMessage({ error, retry }: { error: Error; retry?: () => void }) {
  return <div className="error" role="alert"><strong>We couldn’t complete that step.</strong><p>{error.message}</p>{retry && <button className="button secondary" onClick={retry}>Try again</button>}</div>
}

function Start() {
  const navigate = useNavigate()
  const scenarios = useQuery({ queryKey: ['scenarios'], queryFn: api.scenarios })
  const begin = useMutation({
    mutationFn: async () => { await api.createSession(); return api.createApplication() },
    onSuccess: app => navigate(`/applications/${app.id}/review`),
  })
  return <div className="start-wrap"><section className="hero"><div className="eyebrow">Personal loan demonstration</div><h1>A clear view of your loan application</h1><p className="lead">Choose a synthetic customer journey and explore a complete indicative assessment.</p><Notice /><h2>How would you like to continue?</h2><div className="customer-choices"><button className="choice" onClick={() => begin.mutate()} disabled={begin.isPending || scenarios.isLoading}><UserRound /><span><strong>New customer</strong><small>Start a new application as Avery</small></span><ArrowRight /></button><button className="choice" onClick={() => navigate('/login')} disabled={scenarios.isLoading}><Landmark /><span><strong>Existing customer</strong><small>Use Morgan’s simulated login</small></span><ArrowRight /></button></div>{begin.isPending && <div role="status">Preparing demonstration…</div>}{scenarios.isError && <ErrorMessage error={scenarios.error} retry={() => void scenarios.refetch()} />}{begin.isError && <ErrorMessage error={begin.error} retry={() => begin.mutate()} />}</section><aside className="preview-card" aria-label="What this demonstration includes"><div className="mini-icon"><ShieldCheck /></div><h2>What you’ll see</h2><ul className="feature-list"><li><FileCheck2 /><span><strong>Documents already processed</strong>Synthetic records ready to review</span></li><li><BadgeCheck /><span><strong>Figures ready to verify</strong>Clear source and assessment details</span></li><li><Landmark /><span><strong>An indicative outcome</strong>Including affordability and next steps</span></li></ul><p className="small">Takes about 3 minutes to review.</p></aside></div>
}

function Login() {
  const navigate = useNavigate()
  const login = useMutation({ mutationFn: api.login })
  const begin = useMutation({ mutationFn: () => api.createApplication('scenario-b'), onSuccess: app => navigate(`/applications/${app.id}/review`) })
  return <Page narrow><div className="login-card"><span className="outcome-icon"><LockKeyhole /></span><div className="eyebrow">Existing customer</div><h1>Simulated secure login</h1>{!login.data ? <><p>Continue to load Morgan Sample’s synthetic customer profile. No password or real credentials are required.</p><Notice /><button autoFocus className="button primary" onClick={() => login.mutate()} disabled={login.isPending}>{login.isPending ? 'Signing in…' : 'Log in to demo profile'} <ArrowRight /></button></> : <><div className="profile-confirm"><CheckCircle2 /><div><strong>{login.data.customerName}</strong><span>Customer reference {login.data.customerReference}</span></div></div><p className="auth-notice">{login.data.notice}</p><button autoFocus className="button primary" onClick={() => begin.mutate()} disabled={begin.isPending}>{begin.isPending ? 'Preparing application…' : 'Continue with this profile'} <ArrowRight /></button></>}{(login.isError || begin.isError) && <ErrorMessage error={(login.error || begin.error)!} />}</div></Page>
}

function Progress() {
  return <nav className="progress" aria-label="Application progress"><div className="mobile-progress"><div><strong>Review and submit</strong><span>Step 4 of 5</span></div><progress max="5" value="4">4 of 5</progress></div><ol>{stages.map((stage, i) => <li className={i < 3 ? 'done' : i === 3 ? 'current' : ''} key={stage}><span>{i < 3 ? <Check size={16} /> : i + 1}</span><em>{stage}</em></li>)}</ol></nav>
}

const label = (type: string) => ({ drivers_licence: 'Freddie State driver licence', payslip: 'Payslip', bank_statement: 'Bank statement' })[type] || type
const dateLabel = (value: string) => new Date(`${value}T00:00:00`).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })
const periodLabel = (start: string | null, end: string | null) => start && end ? (start === end ? dateLabel(start) : `${dateLabel(start)} to ${dateLabel(end)}`) : ''
function Review() {
  const { id = '' } = useParams(); const navigate = useNavigate(); const heading = useRef<HTMLHeadingElement>(null)
  const [confirmed, setConfirmed] = useState(true)
  const query = useQuery({ queryKey: ['application', id], queryFn: () => api.application(id) })
  const submit = useMutation({ mutationFn: () => api.submit(id), onSuccess: () => navigate(`/applications/${id}/outcome`) })
  useEffect(() => { heading.current?.focus() }, [])
  if (query.isLoading) return <Loading label="Loading your application" />
  if (query.isError) return <Page><ErrorMessage error={query.error} retry={() => void query.refetch()} /></Page>
  const app = query.data!
  return <><Progress /><Page><div className="page-intro"><div className="eyebrow">Review · Step 4 of 5</div><h1 ref={heading} tabIndex={-1}>Check your application</h1><p>We’ve processed the synthetic documents and brought the key details together. Check each section before submitting.</p></div><Notice /><div className="layout"><div className="stack"><LoanCard app={app} /><PersonCard app={app} /><DocumentsCard app={app} /><ReviewCard app={app} /></div><Summary app={app} confirmed={confirmed} setConfirmed={setConfirmed} submit={() => submit.mutate()} pending={submit.isPending} error={submit.error} /></div></Page></>
}

function LoanCard({ app }: { app: Application }) {
  const client = useQueryClient(); const [editing, setEditing] = useState(false); const [detail, setDetail] = useState(app.loan.purposeDetail); const [saved, setSaved] = useState(false)
  const correction = useMutation({ mutationFn: () => api.correctPurpose(app.id, detail.trim()), onSuccess: async () => { await client.invalidateQueries({ queryKey: ['application', app.id] }); setEditing(false); setSaved(true) } })
  return <Section number="1" title="Loan"><dl className="detail-grid"><Item term="Loan amount" value={aud(app.loan.amount)} strong /><Item term="Term" value={`${app.loan.termYears} years`} /><div><dt>Purpose detail</dt><dd>{app.loan.purposeDetail}</dd></div></dl>{editing ? <form className="purpose-form" onSubmit={event => { event.preventDefault(); correction.mutate() }}><label htmlFor="purpose-detail">Update purpose detail</label><textarea id="purpose-detail" value={detail} maxLength={500} required onChange={event => setDetail(event.target.value)} autoFocus /><div><button className="button primary" disabled={correction.isPending || !detail.trim()}>Save change</button><button type="button" className="button secondary" onClick={() => { setDetail(app.loan.purposeDetail); setEditing(false) }}>Cancel</button></div>{correction.isError && <ErrorMessage error={correction.error} />}</form> : <button className="text-button" onClick={() => { setSaved(false); setEditing(true) }}>Edit purpose detail</button>}<div className="save-status" aria-live="polite">{saved && 'Purpose detail saved. The original is retained in correction history.'}</div></Section>
}
function PersonCard({ app }: { app: Application }) { return <Section number="2" title="About you"><dl className="detail-grid"><Item term="Applicant" value={app.customer.name} strong /><Item term="Date of birth" value={new Date(`${app.customer.dateOfBirth}T00:00:00`).toLocaleDateString('en-AU', { dateStyle: 'long' })} /><Item term="Address" value={app.customer.address} /><Item term="Employment" value={`Permanent · ${app.customer.employer}`} />{app.customer.existingCustomerReference && <Item term="Customer reference" value={app.customer.existingCustomerReference} />}{app.customer.profileConfirmation?.confirmed && <Item term="Profile confirmation" value={`${app.customer.profileConfirmation.fields.length} profile fields confirmed`} source="Existing customer record" />}</dl></Section> }
function DocumentsCard({ app }: { app: Application }) {
  const payslips = app.documents.filter(document => document.type === 'payslip')
  const statements = app.documents.filter(document => document.type === 'bank_statement')
  const licences = app.documents.filter(document => document.type === 'drivers_licence')
  const documentAccount = (id: string) => id.includes('-B1-') ? app.accounts[0]?.accountMasked : id.includes('-B2-') ? app.accounts[1]?.accountMasked : null
  return <Section number="3" title="Documents"><p className="section-copy">Every document was generated for this demonstration and has finished processing.</p><div className="document-groups">{licences.length > 0 && <DocumentGroup count={licences.length} label="Driver licence" detail="Identity document" />}{payslips.length > 0 && <DocumentGroup count={payslips.length} label="Payslips" detail="Latest two complete months" />}{statements.length > 0 && <DocumentGroup count={statements.length} label="Bank statements" detail={`${app.accounts.length} active account${app.accounts.length === 1 ? '' : 's'} · three months`} />}</div><details className="document-details"><summary>View all {app.documents.length} processed documents</summary><ul className="documents">{app.documents.map(doc => <li key={doc.id}><span className="doc-icon"><FileCheck2 /></span><span><strong>{label(doc.type)}{documentAccount(doc.id) ? ` · ${documentAccount(doc.id)}` : ''}</strong><small>{doc.issuer}{periodLabel(doc.periodStart, doc.periodEnd) ? ` · ${periodLabel(doc.periodStart, doc.periodEnd)}` : ''}</small></span><span className="status"><CheckCircle2 /> Processed</span></li>)}</ul></details></Section>
}
function DocumentGroup({ count, label: groupLabel, detail }: { count: number; label: string; detail: string }) { return <div><span className="doc-icon"><FileCheck2 /></span><strong>{count} {groupLabel.toLowerCase()}</strong><small>{detail}</small><span className="status"><CheckCircle2 /> Processed</span></div> }
function ReviewCard({ app }: { app: Application }) { return <Section number="4" title="Verified figures"><p className="section-copy">Figures combine profile, document and classified transaction sources.</p>{app.customer.type === 'existing' && <><h3>Active accounts</h3><ul className="account-list">{app.accounts.map(account => <li key={account.id}><strong>{humanize(account.type)}</strong><span>BSB {account.bsbMasked} · Account {account.accountMasked}</span><small>{account.ownership === 'joint' ? `${Math.round(account.applicantShare * 100)}% applicant share · Joint` : '100% applicant share · Sole'} · Active</small></li>)}</ul><dl className="detail-grid financials"><Item term="Assets" value={aud(app.financialPosition.assetsTotal)} source="Confirmed profile" /><Item term="Liabilities" value={aud(app.financialPosition.liabilitiesTotal)} source="Credit profile" /><Item term="Monthly debt repayments" value={aud(app.financialPosition.monthlyDebtRepayments)} source="Accounts and statements" /></dl></>}<dl className="detail-grid figures"><Item term="Monthly net income" value={aud(app.review.monthlyNetIncome)} source="Income documents + transactions" strong /><Item term="Monthly living expenses" value={aud(app.review.assessedLivingExpenses)} source="Transactions + benchmark" /><Item term="Monthly housing" value={aud(app.review.monthlyHousing)} source="Statements · verified" /><Item term="Transactions reviewed" value={`${app.review.classifiedTransactionCount} classified`} source="Transaction history" /></dl>{app.review.transactionCategories?.length > 0 && <details className="category-details"><summary>View all {app.review.transactionCategories.length} transaction categories</summary><ul className="category-grid">{app.review.transactionCategories.map(item => <li key={item.category}><span>{humanize(item.category)}</span><strong>{item.count}</strong></li>)}</ul></details>}<div className="verified-line"><BadgeCheck /> {app.review.documentChecksPassed} document checks passed</div></Section> }

function Section({ number, title, children }: { number: string; title: string; children: ReactNode }) { return <section className="card"><header className="card-title"><span>{number}</span><h2>{title}</h2><span className="complete"><Check /> Complete</span></header>{children}</section> }
function Item({ term, value, source, strong }: { term: string; value: string; source?: string; strong?: boolean }) { return <div><dt>{term}</dt><dd className={strong ? 'strong' : ''}>{value}</dd>{source && <small>{source}</small>}</div> }
function Summary({ app, confirmed, setConfirmed, submit, pending, error }: { app: Application; confirmed: boolean; setConfirmed: (confirmed: boolean) => void; submit: () => void; pending: boolean; error: Error | null }) { return <aside className="summary"><h2>Application summary</h2><div className="summary-amount"><span>Requested</span><strong>{aud(app.loan.amount)}</strong><small>over {app.loan.termYears} years</small></div><dl><Item term="Applicant" value={app.customer.name} /><Item term="Purpose" value={app.loan.purposeDetail} /><Item term="Documents" value={`${app.documents.length} processed`} /></dl><hr /><p><ShieldCheck /> Indicative assessment only. No real credit record is affected.</p><div className="summary-submit"><h3>Ready to submit?</h3><label className="check"><input type="checkbox" checked={confirmed} onChange={event => setConfirmed(event.target.checked)} /> <span>I confirm the synthetic details are correct</span></label>{error && <ErrorMessage error={error} />}<button className="button primary" onClick={submit} disabled={pending || !confirmed}>{pending ? 'Submitting securely…' : 'Submit for indicative outcome'}<ArrowRight size={19} /></button><div className="live" aria-live="polite">{pending && 'Your demonstration application is being submitted.'}</div></div></aside> }

function Outcome() {
  const { id = '' } = useParams(); const navigate = useNavigate()
  const outcome = useQuery({ queryKey: ['outcome', id], queryFn: () => api.outcome(id) })
  if (outcome.isLoading) return <Loading label="Preparing your indicative outcome" />
  if (outcome.isError) return <Page><ErrorMessage error={outcome.error} retry={() => void outcome.refetch()} /></Page>
  const data = outcome.data!
  if (data.decision === 'referred') {
    const observedSignals = data.factors.filter(factor => factor.factor === 'gambling_activity' || factor.factor === 'short_term_credit_use')
    return <Page narrow><Notice /><div className="outcome-heading referred"><span className="outcome-icon"><CircleHelp /></span><div className="eyebrow">Indicative outcome</div><h1>Your application has been referred</h1><p>We can’t provide an automated indicative approval. A referral means the synthetic application would need further review—it is not a decline.</p></div><div className="result-grid referral-grid"><section className="card score"><h2>Assessment summary</h2><div className="score-row"><div><span>Risk score</span><strong>{data.riskScore}</strong><small>Moderate risk band · scale 1–1000</small></div><div><span>Affordability</span><strong className="affordable"><CheckCircle2 /> Affordable</strong><small>{aud(data.monthlySurplus)} estimated monthly surplus</small></div></div></section><section className="card"><h2>Why further review is needed</h2><ul className="risk-list">{data.reasons.map(reason => <li key={reason}>{reasonLabels[reason] || humanize(reason)}</li>)}{observedSignals.map(factor => <li key={`reason-${factor.factor}`}>{factorDescriptions[factor.factor]}</li>)}</ul></section></div>{data.factors?.length > 0 && <section className="card factor-card"><h2>Assessment signals</h2><p>These synthetic transaction-derived signals contributed to or moderated the result.</p><ul className="factor-grid">{data.factors.map(factor => <li key={`${factor.factor}-${factor.signal}`}><strong>{factorLabels[factor.factor] || humanize(factor.factor)}</strong><span>{factorDescriptions[factor.factor] || factor.signal}</span><small className={factor.riskValue === 0 ? 'positive-signal' : ''}>{factorContribution(factor.riskValue)}</small></li>)}</ul></section>}<section className="terminal-panel"><LockKeyhole /><div><h2>No offer or funds movement is available</h2><p>This illustrative outcome is not a credit offer. Because this application was referred, no simulated offer was created and funding cannot continue.</p></div></section><a className="button secondary return-link" href="/">Return to start</a></Page>
  }
  return <Page narrow><Notice /><div className="outcome-heading"><span className="outcome-icon"><BadgeCheck /></span><div className="eyebrow">Indicative outcome</div><h1>Your application is indicatively approved</h1><p>This is not a guarantee or a final lending decision. It’s based only on the synthetic information reviewed.</p></div><div className="result-grid"><section className="card score"><h2>Assessment summary</h2><div className="score-row"><div><span>Risk score</span><strong>{data.riskScore}</strong><small>Very low risk band · scale 1–1000</small></div><div><span>Affordability</span><strong className="affordable"><CheckCircle2 /> Affordable</strong><small>{aud(data.monthlySurplus)} estimated monthly surplus</small></div></div></section><section className="card"><h2>Why you received this result</h2><ul className="reasons">{data.reasons.map(reason => <li key={reason}><CheckCircle2 />{reasonLabels[reason] || reason.replaceAll('_', ' ')}</li>)}</ul></section></div><section className="warm-panel"><div><h2>Your simulated offer is ready</h2><p>This is not an offer of credit. Review the demonstration rate, fee, repayments and total before continuing.</p></div><button className="button primary" onClick={() => navigate(`/applications/${id}/offer`)}>Review simulated offer <ArrowRight /></button></section></Page>
}

function Offer() {
  const { id = '' } = useParams(); const client = useQueryClient(); const [funding, setFunding] = useState<Disbursement | null>(null)
  const offer = useQuery({ queryKey: ['offer', id], queryFn: () => api.offer(id) })
  const accept = useMutation({ mutationFn: (offerId: string) => api.accept(offerId), onSuccess: data => client.setQueryData(['offer', id], data) })
  const disburse = useMutation({ mutationFn: (offerId: string) => api.disburse(offerId), onSuccess: setFunding })
  if (offer.isLoading) return <Loading label="Loading your offer" />
  if (offer.isError) return <Page><ErrorMessage error={offer.error} retry={() => void offer.refetch()} /></Page>
  const data = offer.data!
  if (funding) return <Funding disbursement={funding} />
  return <Page narrow><Notice full /><div className="page-intro offer-intro"><div className="eyebrow">Simulated personal loan offer</div><h1>Review your offer</h1><p>Take time to check the costs and assumptions. Accepting this simulation does not create a real loan.</p></div><section className="offer-card"><div className="offer-principal"><span>Loan amount</span><strong>{aud(data.principal)}</strong><small>{data.termYears}-year term</small></div><div className="offer-facts"><Item term="Interest rate" value={`${(data.annualRateBasisPoints / 100).toFixed(0)}% p.a.`} /><Item term="Monthly fee" value={aud(data.monthlyFee)} /><Item term="Monthly repayment" value={aud(data.monthlyRepayment)} source="Includes the monthly fee" strong /><Item term="Total repayable" value={aud(data.totalRepayable)} source={`Across ${data.termYears * 12} monthly repayments`} /></div></section><section className="card acceptance"><h2>{data.status === 'ready' ? 'Accept this simulated offer?' : 'Offer accepted'}</h2><p>Destination for simulated funding: <strong>{data.destinationAccountMasked}</strong></p>{(accept.isError || disburse.isError) && <ErrorMessage error={(accept.error || disburse.error)!} />}{data.status === 'ready' ? <button className="button primary" disabled={accept.isPending} onClick={() => accept.mutate(data.id)}>{accept.isPending ? 'Accepting…' : 'Accept simulated offer'} <Check /></button> : <button className="button primary" disabled={disburse.isPending} onClick={() => disburse.mutate(data.id)}>{disburse.isPending ? 'Simulating funding…' : 'Simulate funding'} <Banknote /></button>}<div className="live" aria-live="polite">{accept.isPending && 'Accepting the simulated offer.'}{disburse.isPending && 'Simulating funds transfer.'}</div></section></Page>
}

function Funding({ disbursement }: { disbursement: Disbursement }) { return <Page narrow><Notice full /><section className="funded"><span className="outcome-icon"><Check /></span><div className="eyebrow">Simulation complete</div><h1>Funding simulation confirmed</h1><p>A simulated transfer of <strong>{aud(disbursement.amount)}</strong> to <strong>{disbursement.destinationAccountMasked}</strong> has been recorded.</p><dl className="funding-details"><Item term="Status" value="Completed" /><Item term="Reference" value={disbursement.transferReference} /></dl><div className="final-notice"><Banknote /><div><strong>Simulation only—no money was transferred.</strong><span>No bank account was credited and no real loan was created.</span></div></div><a className="button secondary" href="/">Return to start</a></section></Page> }
function Page({ children, narrow = false }: { children: ReactNode; narrow?: boolean }) { return <div className={`page ${narrow ? 'page-narrow' : ''}`}>{children}</div> }
function Loading({ label }: { label: string }) { return <div className="loading" role="status"><span className="spinner" />{label}…</div> }
