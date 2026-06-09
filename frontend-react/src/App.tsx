import { useEffect, useMemo, useState } from 'react'
import './App.css'
import { authService } from './services/auth'
import { electionsApi } from './services/api/elections'
import { votingApi } from './services/api/voting'
import type { Candidate, Election, User } from './types'

type Language = 'en' | 'hi'
type Step = 'landing' | 'home' | 'auth' | 'verify-email' | 'otp' | 'voting' | 'success'
type AuthMode = 'login' | 'register'
type NoticeTone = 'info' | 'success' | 'error'
type PublicElectionState = 'active' | 'upcoming' | 'ended'
type ElectionFilter = 'all' | PublicElectionState | 'starred'

interface PublicElection {
  id: string
  title: string
  description: string
  electionType: string
  startTime: string
  endTime: string
  isPublic: boolean
  totalVotesCast: number
  candidateCount: number
  state: PublicElectionState
}

interface RegistrationFormState {
  email: string
  username: string
  firstName: string
  lastName: string
}

interface Notice {
  id: number
  tone: NoticeTone
  message: string
}

const API_BASE_URL = (import.meta as any).env?.VITE_API_URL || '/api/v1'

const STRINGS: Record<Language, Record<string, string>> = {
  en: {
    appTitle: 'JANADESH',
    tagline: 'Secure, Transparent, Accountable Voting',
    subtitle: 'Professional digital voting for campus elections',
    landingTitle: 'Vote With Confidence',
    landingSubtitle: 'Interactive, secure digital elections with OTP-backed identity verification.',
    landingCta: 'Get Started',
    landingSecondary: 'Already registered? Login',
    featureSecure: 'OTP-based identity validation',
    featureRealtime: 'Real-time election insights',
    featureVerifiable: 'Database + blockchain verification pipeline',
    lifecycleBoard: 'Election Lifecycle Board',
    secureGateway: 'Secure Access Gateway',
    noElectionData: 'No election schedule data available yet.',
    phaseDistribution: 'Phase Distribution',
    timelineTitle: 'Election Windows',
    processTitle: 'How Voting Works',
    chooseElection: 'Choose Active Election',
    noActiveElections: 'No active elections available. Create one from backend and refresh.',
    noElectionsFound: 'No elections match your current search/filter.',
    proceedToVote: 'Continue to Voting',
    viewResults: 'View Live Results',
    hideResults: 'Hide Results',
    resultsLocked: 'Results unlock after voting ends.',
    resultsReady: 'Final results are now available.',
    electionDetails: 'Election Details',
    electionWindow: 'Voting Window',
    searchPlaceholder: 'Search elections by title',
    filterAll: 'All',
    filterActive: 'Active',
    filterUpcoming: 'Upcoming',
    filterEnded: 'Ended',
    filterStarred: 'Starred',
    copyVoteLink: 'Copy Vote Link',
    linkCopied: 'Vote link copied to clipboard.',
    exportCsv: 'Download CSV',
    csvReady: 'Results CSV downloaded.',
    activeNow: 'Active',
    upcoming: 'Upcoming',
    ended: 'Ended',
    authTitle: 'Secure Sign-In',
    loginWithEmail: 'Use Email',
    loginWithPhone: 'Use Phone Number',
    preferredLoginMethod: 'Preferred OTP Login',
    loginNow: 'Login',
    registerNow: 'Register',
    requestOtp: 'Request OTP',
    verifyOtp: 'Verify OTP',
    votingTitle: 'Cast Your Ballot',
    voteSuccessTitle: 'Vote Recorded Successfully',
    voteSuccessSubtitle: 'Your vote is stored in DB and queued for blockchain verification.',
    finish: 'Return Home',
    back: 'Back',
    signOut: 'Sign Out',
    loginRequired: 'Please login to continue voting.',
    loginForResults: 'Login is required to load live results.',
    electionNotEligible: 'You are not eligible for this election at the moment.',
    alreadyVoted: 'You have already voted in this election.',
    emailPlaceholder: 'Enter your email address',
    phonePlaceholder: 'Enter phone number',
    identifierPlaceholderPhone: 'Email used as login ID',
    otpPlaceholder: 'Enter 6-digit OTP',
    usernamePlaceholder: 'Choose username',
    firstNamePlaceholder: 'First name (optional)',
    lastNamePlaceholder: 'Last name (optional)',
    waitingOtp: 'OTP sent to your selected login channel.',
    emailRequired: 'Please enter a valid email.',
    phoneRequired: 'Please enter a valid phone number.',
    otpRequired: 'Please enter OTP code.',
    usernameRequired: 'Username must be at least 3 characters.',
    accountNotFound: 'Account not found. Please register first.',
    useRegisteredMethod: 'Use your registered login method for this account.',
    registrationSuccess: 'Registration successful. Please verify your email.',
    chooseElectionFirst: 'Please select an election first.',
    chooseCandidateFirst: 'Please select a candidate.',
    voteRecorded: 'Vote submitted successfully.',
    loading: 'Loading...',
    candidates: 'Candidates',
    totalVotes: 'Total Votes',
    votesLabel: 'No. of Votes',
    voteShareLabel: 'Vote Percentage',
    noResultsYet: 'No candidate results available yet.',
    noDescription: 'No description provided',
    candidateFallback: 'Candidate',
    independent: 'Independent',
    electionClock: 'Election Clock',
    trustIndex: 'Trust Index',
    startsIn: 'Starts in',
    endsIn: 'Ends in',
    endedSince: 'Ended',
    leaderMargin: 'Winning Margin',
    competitionLevel: 'Competition',
    tightRace: 'Tight Race',
    moderateRace: 'Moderate Race',
    clearLead: 'Clear Lead',
    winner: 'Leading',
    selectCandidateHint: 'Select one candidate and submit your final vote.',
    stepsTitle: 'Voting Journey',
    stepOne: '1. Select Election',
    stepTwo: '2. Verify Identity',
    stepThree: '3. Cast Vote',
    professionalNote: 'One account, one vote, fully auditable trail.',
  },
  hi: {
    appTitle: 'जनादेश',
    tagline: 'सुरक्षित, पारदर्शी और जवाबदेह मतदान',
    subtitle: 'कॉलेज चुनावों के लिए पेशेवर डिजिटल मतदान अनुभव',
    landingTitle: 'विश्वास के साथ मतदान करें',
    landingSubtitle: 'OTP आधारित पहचान सत्यापन के साथ इंटरैक्टिव और सुरक्षित डिजिटल चुनाव।',
    landingCta: 'शुरू करें',
    landingSecondary: 'पहले से पंजीकृत हैं? लॉगिन करें',
    featureSecure: 'OTP आधारित पहचान सत्यापन',
    featureRealtime: 'रियल-टाइम चुनाव इनसाइट्स',
    featureVerifiable: 'डेटाबेस + ब्लॉकचेन सत्यापन पाइपलाइन',
    lifecycleBoard: 'चुनाव लाइफसाइकल बोर्ड',
    secureGateway: 'सुरक्षित एक्सेस गेटवे',
    noElectionData: 'अभी चुनाव शेड्यूल डेटा उपलब्ध नहीं है।',
    phaseDistribution: 'चरण वितरण',
    timelineTitle: 'चुनाव विंडो',
    processTitle: 'मतदान प्रक्रिया',
    chooseElection: 'सक्रिय चुनाव चुनें',
    noActiveElections: 'अभी कोई सक्रिय चुनाव उपलब्ध नहीं है। बैकएंड से चुनाव बनाकर रिफ्रेश करें।',
    noElectionsFound: 'आपकी खोज/फ़िल्टर के अनुसार कोई चुनाव नहीं मिला।',
    proceedToVote: 'मतदान जारी रखें',
    viewResults: 'लाइव परिणाम देखें',
    hideResults: 'परिणाम छुपाएँ',
    resultsLocked: 'मतदान समाप्त होने के बाद परिणाम खुलेंगे।',
    resultsReady: 'अंतिम परिणाम अब उपलब्ध हैं।',
    electionDetails: 'चुनाव विवरण',
    electionWindow: 'मतदान समय सीमा',
    searchPlaceholder: 'शीर्षक से चुनाव खोजें',
    filterAll: 'सभी',
    filterActive: 'सक्रिय',
    filterUpcoming: 'आगामी',
    filterEnded: 'समाप्त',
    filterStarred: 'स्टार',
    copyVoteLink: 'वोट लिंक कॉपी करें',
    linkCopied: 'वोट लिंक क्लिपबोर्ड में कॉपी हो गया।',
    exportCsv: 'CSV डाउनलोड करें',
    csvReady: 'परिणाम CSV डाउनलोड हो गया।',
    activeNow: 'सक्रिय',
    upcoming: 'आगामी',
    ended: 'समाप्त',
    authTitle: 'सुरक्षित साइन-इन',
    loginWithEmail: 'ईमेल से लॉगिन',
    loginWithPhone: 'फोन नंबर से लॉगिन',
    preferredLoginMethod: 'OTP लॉगिन प्राथमिकता',
    loginNow: 'लॉगिन',
    registerNow: 'रजिस्टर',
    requestOtp: 'OTP भेजें',
    verifyOtp: 'OTP सत्यापित करें',
    votingTitle: 'अपना मत दें',
    voteSuccessTitle: 'मत सफलतापूर्वक दर्ज हुआ',
    voteSuccessSubtitle: 'आपका मत डेटाबेस में सुरक्षित है और ब्लॉकचेन सत्यापन कतार में है।',
    finish: 'होम पर वापस जाएँ',
    back: 'वापस',
    signOut: 'साइन आउट',
    loginRequired: 'मतदान जारी रखने के लिए कृपया लॉगिन करें।',
    loginForResults: 'लाइव परिणाम देखने के लिए लॉगिन आवश्यक है।',
    electionNotEligible: 'आप अभी इस चुनाव के लिए पात्र नहीं हैं।',
    alreadyVoted: 'आप इस चुनाव में पहले ही मतदान कर चुके हैं।',
    emailPlaceholder: 'अपना ईमेल दर्ज करें',
    phonePlaceholder: 'फोन नंबर दर्ज करें',
    identifierPlaceholderPhone: 'लॉगिन आईडी के लिए ईमेल',
    otpPlaceholder: '6 अंकों का OTP दर्ज करें',
    usernamePlaceholder: 'यूज़रनेम चुनें',
    firstNamePlaceholder: 'पहला नाम (वैकल्पिक)',
    lastNamePlaceholder: 'अंतिम नाम (वैकल्पिक)',
    waitingOtp: 'OTP आपके चुने हुए लॉगिन चैनल पर भेज दिया गया है।',
    emailRequired: 'कृपया सही ईमेल दर्ज करें।',
    phoneRequired: 'कृपया सही फोन नंबर दर्ज करें।',
    otpRequired: 'कृपया OTP कोड दर्ज करें।',
    usernameRequired: 'यूज़रनेम कम से कम 3 अक्षरों का होना चाहिए।',
    accountNotFound: 'यह खाता नहीं मिला। पहले रजिस्टर करें।',
    useRegisteredMethod: 'इस खाते के लिए पंजीकृत लॉगिन विधि का उपयोग करें।',
    registrationSuccess: 'रजिस्ट्रेशन सफल। कृपया अपना ईमेल सत्यापित करें।',
    chooseElectionFirst: 'कृपया पहले चुनाव चुनें।',
    chooseCandidateFirst: 'कृपया उम्मीदवार चुनें।',
    voteRecorded: 'मत सफलतापूर्वक जमा हुआ।',
    loading: 'लोड हो रहा है...',
    candidates: 'उम्मीदवार',
    totalVotes: 'कुल वोट',
    votesLabel: 'वोटों की संख्या',
    voteShareLabel: 'मत प्रतिशत',
    noResultsYet: 'अभी उम्मीदवार परिणाम उपलब्ध नहीं हैं।',
    noDescription: 'विवरण उपलब्ध नहीं है',
    candidateFallback: 'उम्मीदवार',
    independent: 'स्वतंत्र',
    electionClock: 'चुनाव घड़ी',
    trustIndex: 'विश्वसनीयता सूचकांक',
    startsIn: 'शुरू होने में',
    endsIn: 'समाप्त होने में',
    endedSince: 'समाप्त',
    leaderMargin: 'जीत का अंतर',
    competitionLevel: 'प्रतिस्पर्धा स्तर',
    tightRace: 'कड़ी टक्कर',
    moderateRace: 'मध्यम टक्कर',
    clearLead: 'स्पष्ट बढ़त',
    winner: 'आगे',
    selectCandidateHint: 'एक उम्मीदवार चुनें और अंतिम मत जमा करें।',
    stepsTitle: 'मतदान यात्रा',
    stepOne: '1. चुनाव चुनें',
    stepTwo: '2. पहचान सत्यापित करें',
    stepThree: '3. मत दर्ज करें',
    professionalNote: 'एक खाता, एक वोट, पूरी तरह ऑडिट योग्य प्रक्रिया।',
  },
}

const HI_CONTENT_MAP: Record<string, string> = {
  'Student Council President 2026': 'छात्र परिषद अध्यक्ष 2026',
  'Cultural Secretary 2026': 'सांस्कृतिक सचिव 2026',
  'Sports Committee Chair 2026': 'खेल समिति अध्यक्ष 2026',
  'Library Council Lead 2026': 'लाइब्रेरी परिषद प्रमुख 2026',
  'Innovation Club Lead 2026': 'इनोवेशन क्लब प्रमुख 2026',
  'General student body election for the position of council president.':
    'छात्र परिषद अध्यक्ष पद के लिए सामान्य छात्र निकाय का चुनाव।',
  'Election for events, festivals, and cultural committee leadership.':
    'कार्यक्रमों, उत्सवों और सांस्कृतिक समिति नेतृत्व के लिए चुनाव।',
  'Election to lead college sports events and athlete support initiatives.':
    'कॉलेज खेल आयोजनों और खिलाड़ियों के समर्थन पहलों के नेतृत्व के लिए चुनाव।',
  'Completed election for library modernization and reading culture programs.':
    'लाइब्रेरी आधुनिकीकरण और पठन संस्कृति कार्यक्रमों के लिए पूर्ण हो चुका चुनाव।',
  'Upcoming election for startup and innovation club leadership.':
    'स्टार्टअप और इनोवेशन क्लब नेतृत्व के लिए आगामी चुनाव।',
  'Aarav Malhotra': 'आरव मल्होत्रा',
  'Sana Verma': 'सना वर्मा',
  'Ritvik Sharma': 'ऋत्विक शर्मा',
  'Meera Singh': 'मीरा सिंह',
  'Karthik Rao': 'कार्तिक राव',
  'Dev Khanna': 'देव खन्ना',
  'Nisha Iyer': 'निशा अय्यर',
  'Harsh Gupta': 'हर्ष गुप्ता',
  'Ananya Das': 'अनन्या दास',
  'Vivek Menon': 'विवेक मेनन',
  'Ishaan Arora': 'ईशान अरोड़ा',
  'Priya Nair': 'प्रिया नायर',
  'Campus reform and transparency agenda': 'कैंपस सुधार और पारदर्शिता एजेंडा',
  'Student welfare and mental health support': 'छात्र कल्याण और मानसिक स्वास्थ्य समर्थन',
  'Academic innovation and clubs expansion': 'शैक्षणिक नवाचार और क्लब विस्तार',
  'Inclusive festivals and inter-college collaborations': 'समावेशी उत्सव और अंतर- कॉलेज सहयोग',
  'High-impact annual fest strategy': 'उच्च प्रभाव वाला वार्षिक उत्सव रणनीति',
  'Infrastructure-first sports plan': 'इंफ्रास्ट्रक्चर-प्रथम खेल योजना',
  'Performance coaching and league development': 'प्रदर्शन कोचिंग और लीग विकास',
  'Grassroots participation and wellness programs': 'जमीनी भागीदारी और वेलनेस कार्यक्रम',
  'Digital library and research access expansion': 'डिजिटल लाइब्रेरी और शोध पहुंच का विस्तार',
  'Extended reading spaces and student circles': 'विस्तारित पठन स्थान और छात्र पठन मंडल',
  'Mentorship and prototype lab expansion': 'मेंटॉरशिप और प्रोटोटाइप लैब विस्तार',
  'Incubation pipeline and hackathon ecosystem': 'इन्क्यूबेशन पाइपलाइन और हैकाथॉन इकोसिस्टम',
}

const localizeContent = (value: string | undefined | null, language: Language): string => {
  const normalized = typeof value === 'string' ? value.trim() : ''
  if (!normalized) return ''
  if (language !== 'hi') return normalized
  return HI_CONTENT_MAP[normalized] || normalized
}

const formatDuration = (milliseconds: number): string => {
  const totalSeconds = Math.max(0, Math.floor(milliseconds / 1000))
  const days = Math.floor(totalSeconds / (24 * 3600))
  const hours = Math.floor((totalSeconds % (24 * 3600)) / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)

  if (days > 0) return `${days}d ${hours}h`
  if (hours > 0) return `${hours}h ${minutes}m`
  return `${minutes}m`
}

const getTrustIndex = (election: PublicElection | null): number => {
  if (!election) return 0

  const base = election.isPublic ? 68 : 58
  const candidateBoost = Math.min(election.candidateCount * 4, 18)
  const participationBoost = Math.min(Math.log10(election.totalVotesCast + 1) * 9, 13)
  const stateBoost = election.state === 'ended' ? 10 : election.state === 'active' ? 7 : 3

  return Math.min(99, Math.round(base + candidateBoost + participationBoost + stateBoost))
}

const parseElectionIdFromPath = (pathname: string): string => {
  const match = pathname.match(/^\/vote\/([0-9a-fA-F-]{36})\/?$/)
  return match?.[1] || ''
}

const formatDateTime = (value: string): string => {
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return value

  return parsed.toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

const truncateHash = (value: string): string => {
  if (!value) return ''
  if (value.length <= 18) return value
  return `${value.slice(0, 10)}...${value.slice(-8)}`
}

const getCandidateInitials = (name: string): string => {
  const words = name.trim().split(/\s+/).slice(0, 2)
  if (words.length === 0) return 'NA'
  return words.map(word => word[0]?.toUpperCase() || '').join('')
}

const getElectionState = (startTime: string, endTime: string): PublicElectionState => {
  const now = Date.now()
  const start = new Date(startTime).getTime()
  const end = new Date(endTime).getTime()

  if (Number.isNaN(start) || Number.isNaN(end)) return 'active'
  if (now < start) return 'upcoming'
  if (now > end) return 'ended'
  return 'active'
}

const isValidEmail = (input: string): boolean => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.trim())

function App() {
  const [language, setLanguage] = useState<Language>(() => {
    const saved = typeof window !== 'undefined' ? window.localStorage.getItem('janadesh-language') : null
    return saved === 'hi' || saved === 'en' ? saved : 'en'
  })
  const [step, setStep] = useState<Step>('landing')
  const [authMode, setAuthMode] = useState<AuthMode>('login')
  const [publicElections, setPublicElections] = useState<PublicElection[]>([])
  const [electionFilter, setElectionFilter] = useState<ElectionFilter>('all')
  const [selectedElectionId, setSelectedElectionId] = useState<string>('')
  const [selectedElection, setSelectedElection] = useState<Election | null>(null)
  const [selectedCandidateId, setSelectedCandidateId] = useState<string>('')
  const [loginIdentifier, setLoginIdentifier] = useState<string>('')
  const [pendingVerificationEmail, setPendingVerificationEmail] = useState<string>('')
  const [otp, setOtp] = useState<string>('')
  const [registrationForm, setRegistrationForm] = useState<RegistrationFormState>({
    email: '',
    username: '',
    firstName: '',
    lastName: '',
  })
  const [transactionHash, setTransactionHash] = useState<string>('')
  const [eligibilityReason, setEligibilityReason] = useState<string>('')
  const [inlineError, setInlineError] = useState<string>('')
  const [notice, setNotice] = useState<Notice | null>(null)
  const [currentUser, setCurrentUser] = useState<User | null>(null)
  const [showResults, setShowResults] = useState<boolean>(false)
  const [loading, setLoading] = useState<boolean>(true)
  const [otpLoading, setOtpLoading] = useState<boolean>(false)
  const [voteLoading, setVoteLoading] = useState<boolean>(false)
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(authService.isTokenValid())
  const [electionSearch, setElectionSearch] = useState<string>('')
  const [starredElectionIds, setStarredElectionIds] = useState<string[]>(() => {
    if (typeof window === 'undefined') return []
    try {
      const raw = window.localStorage.getItem('janadesh-starred-elections')
      const parsed = raw ? JSON.parse(raw) : []
      return Array.isArray(parsed) ? parsed.filter(value => typeof value === 'string') : []
    } catch {
      return []
    }
  })

  const t = STRINGS[language]

  const selectedPublicElection = useMemo(
    () => publicElections.find(election => election.id === selectedElectionId) || null,
    [publicElections, selectedElectionId],
  )

  const filteredPublicElections = useMemo(() => {
    const term = electionSearch.trim().toLowerCase()
    const stateOrder: Record<PublicElectionState, number> = { active: 0, upcoming: 1, ended: 2 }

    let rows = [...publicElections]

    if (electionFilter === 'starred') {
      rows = rows.filter(election => starredElectionIds.includes(election.id))
    } else if (electionFilter !== 'all') {
      rows = rows.filter(election => election.state === electionFilter)
    }

    if (term) {
      rows = rows.filter(election => {
        const title = localizeContent(election.title, language).toLowerCase()
        const description = localizeContent(election.description, language).toLowerCase()
        return title.includes(term) || description.includes(term)
      })
    }

    rows.sort((a, b) => {
      const aStarred = starredElectionIds.includes(a.id) ? 1 : 0
      const bStarred = starredElectionIds.includes(b.id) ? 1 : 0
      if (aStarred !== bStarred) return bStarred - aStarred

      const stateDiff = stateOrder[a.state] - stateOrder[b.state]
      if (stateDiff !== 0) return stateDiff

      return new Date(a.endTime).getTime() - new Date(b.endTime).getTime()
    })

    return rows
  }, [electionFilter, electionSearch, language, publicElections, starredElectionIds])

  const resultsUnlocked = selectedPublicElection?.state === 'ended'
  const trustIndex = useMemo(() => getTrustIndex(selectedPublicElection), [selectedPublicElection])

  const electionClock = useMemo(() => {
    if (!selectedPublicElection) return ''

    const now = Date.now()
    const start = new Date(selectedPublicElection.startTime).getTime()
    const end = new Date(selectedPublicElection.endTime).getTime()

    if (Number.isNaN(start) || Number.isNaN(end)) return ''

    if (now < start) {
      return `${t.startsIn}: ${formatDuration(start - now)}`
    }

    if (now <= end) {
      return `${t.endsIn}: ${formatDuration(end - now)}`
    }

    return `${t.endedSince}: ${formatDuration(now - end)}`
  }, [selectedPublicElection, t.endedSince, t.endsIn, t.startsIn])

  const resultCandidates: Candidate[] =
    selectedElection && selectedElection.id === selectedElectionId ? selectedElection.candidates : []
  const totalVotes = resultCandidates.reduce((sum, candidate) => sum + (candidate.voteCount || 0), 0)

  const resultInsights = useMemo(() => {
    if (resultCandidates.length < 2 || totalVotes <= 0) return null

    const ranked = [...resultCandidates]
      .map(candidate => ({ ...candidate, votes: candidate.voteCount || 0 }))
      .sort((a, b) => b.votes - a.votes)

    const leader = ranked[0]
    const runnerUp = ranked[1]
    const marginVotes = leader.votes - runnerUp.votes
    const marginPercentage = totalVotes > 0 ? (marginVotes / totalVotes) * 100 : 0

    let competitionKey: 'tightRace' | 'moderateRace' | 'clearLead' = 'clearLead'
    if (marginPercentage <= 5) competitionKey = 'tightRace'
    else if (marginPercentage <= 12) competitionKey = 'moderateRace'

    return {
      marginVotes,
      marginPercentage,
      competitionLabel: t[competitionKey],
    }
  }, [resultCandidates, t, totalVotes])

  const stats = useMemo(() => {
    const active = publicElections.filter(item => item.state === 'active').length
    const candidates = publicElections.reduce((sum, item) => sum + item.candidateCount, 0)
    const votes = publicElections.reduce((sum, item) => sum + item.totalVotesCast, 0)
    return { active, candidates, votes }
  }, [publicElections])

  const showNotice = (tone: NoticeTone, message: string): void => {
    setNotice({ id: Date.now(), tone, message })
  }

  useEffect(() => {
    if (!notice) return
    const timer = window.setTimeout(() => setNotice(null), 4300)
    return () => window.clearTimeout(timer)
  }, [notice])

  useEffect(() => {
    window.localStorage.setItem('janadesh-language', language)
  }, [language])

  useEffect(() => {
    window.localStorage.setItem('janadesh-starred-elections', JSON.stringify(starredElectionIds))
  }, [starredElectionIds])

  useEffect(() => {
    const timer = window.setInterval(() => {
      setPublicElections(current =>
        current.map(election => ({
          ...election,
          state: getElectionState(election.startTime, election.endTime),
        })),
      )
    }, 30000)

    return () => window.clearInterval(timer)
  }, [])

  useEffect(() => {
    if (showResults && !resultsUnlocked) {
      setShowResults(false)
    }
  }, [resultsUnlocked, showResults])

  useEffect(() => {
    if (!isAuthenticated && step === 'home') {
      setStep('landing')
    }
  }, [isAuthenticated, step])

  const loadPublicElections = async (preferredElectionId?: string): Promise<void> => {
    const response = await fetch(`${API_BASE_URL}/elections/public`)
    const payload = await response.json().catch(() => ({}))

    if (!response.ok || payload?.success === false) {
      const message = payload?.error?.message || `HTTP ${response.status}: ${response.statusText}`
      throw new Error(message)
    }

    const rows = Array.isArray(payload?.data?.elections) ? payload.data.elections : []

    const mapped: PublicElection[] = rows.map((row: any) => {
      const startTime = row?.startTime || row?.start_time || ''
      const endTime = row?.endTime || row?.end_time || ''
      return {
        id: row?.id || '',
        title: row?.title || 'Election',
        description: row?.description || '',
        electionType: row?.electionType || row?.election_type || 'single_choice',
        startTime,
        endTime,
        isPublic: Boolean(row?.isPublic ?? row?.is_public ?? true),
        totalVotesCast: Number(row?.totalVotesCast ?? row?.total_votes_cast ?? 0),
        candidateCount: Number(row?.candidateCount ?? 0),
        state: getElectionState(startTime, endTime),
      }
    })

    setPublicElections(mapped)

    setSelectedElectionId(current => {
      if (current) return current
      if (preferredElectionId && mapped.some(election => election.id === preferredElectionId)) {
        return preferredElectionId
      }
      return mapped[0]?.id || ''
    })
  }

  const restoreSession = async (): Promise<boolean> => {
    if (!authService.isTokenValid()) {
      setCurrentUser(null)
      setIsAuthenticated(false)
      return false
    }

    try {
      const user = await authService.getCurrentUser()
      setCurrentUser(user)
      setIsAuthenticated(true)
      return true
    } catch {
      await authService.logout()
      setCurrentUser(null)
      setIsAuthenticated(false)
      return false
    }
  }

  const loadProtectedElection = async (electionId: string): Promise<Election> => {
    const election = await electionsApi.getElection(electionId)
    setSelectedElection(election)
    return election
  }

  const prepareVotingFlow = async (electionId: string): Promise<boolean> => {
    const activeSession = await restoreSession()
    if (!activeSession) {
      setAuthMode('login')
      setStep('auth')
      setInlineError(t.loginRequired)
      return false
    }

    try {
      setLoading(true)
      setInlineError('')
      setEligibilityReason('')

      await loadProtectedElection(electionId)
      const eligibility = await votingApi.checkVotingEligibility(electionId)

      if (!eligibility.isEligible) {
        const reason = eligibility.reason || t.electionNotEligible
        setEligibilityReason(reason)
        if (eligibility.hasVoted) {
          setStep('success')
          showNotice('info', t.alreadyVoted)
        } else {
          setStep('home')
          setInlineError(reason)
        }
        return false
      }

      setSelectedCandidateId('')
      setStep('voting')
      return true
    } catch (error: any) {
      setInlineError(error?.message || 'Failed to prepare voting flow')
      return false
    } finally {
      setLoading(false)
    }
  }

  const loadResults = async (electionId: string): Promise<void> => {
    const activeSession = await restoreSession()
    if (!activeSession) {
      showNotice('info', t.loginForResults)
      return
    }

    try {
      setLoading(true)
      setInlineError('')
      await loadProtectedElection(electionId)
    } catch (error: any) {
      setInlineError(error?.message || 'Failed to load results')
    } finally {
      setLoading(false)
    }
  }
  useEffect(() => {
    const initialize = async (): Promise<void> => {
      setLoading(true)
      const routeElectionId = parseElectionIdFromPath(window.location.pathname)

      try {
        await loadPublicElections(routeElectionId || undefined)
        const hasSession = await restoreSession()

        if (routeElectionId) {
          setSelectedElectionId(routeElectionId)
          if (authService.isTokenValid()) {
            await prepareVotingFlow(routeElectionId)
          } else {
            setStep('auth')
            setAuthMode('login')
          }
        } else if (hasSession) {
          setStep('home')
        } else {
          setStep('landing')
        }
      } catch (error: any) {
        setInlineError(error?.message || 'Failed to initialize app')
      } finally {
        setLoading(false)
      }
    }

    void initialize()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleProceedToVote = async (): Promise<void> => {
    setInlineError('')

    if (!selectedElectionId) {
      setInlineError(t.chooseElectionFirst)
      return
    }

    if (!authService.isTokenValid()) {
      setAuthMode('login')
      setStep('auth')
      return
    }

    await prepareVotingFlow(selectedElectionId)
  }

  const handleRequestOtp = async (): Promise<void> => {
    setInlineError('')
    const normalizedEmail = loginIdentifier.trim().toLowerCase()
    if (!isValidEmail(normalizedEmail)) {
      setInlineError(t.emailRequired)
      return
    }

    try {
      setOtpLoading(true)
      await authService.requestOTP({ email: normalizedEmail })
      setLoginIdentifier(normalizedEmail)
      setStep('otp')
      showNotice('success', t.waitingOtp)
    } catch (error: any) {
      const message = error?.message || 'Failed to request OTP'
      const normalizedMessage = message.toLowerCase()
      if (normalizedMessage.includes('invalid credentials')) {
        setInlineError(t.accountNotFound)
        setAuthMode('register')
      } else {
        setInlineError(message)
      }
    } finally {
      setOtpLoading(false)
    }
  }

  const handleRegister = async (): Promise<void> => {
    setInlineError('')

    const email = registrationForm.email.trim().toLowerCase()
    const username = registrationForm.username.trim()

    if (!isValidEmail(email)) {
      setInlineError(t.emailRequired)
      return
    }

    if (username.length < 3) {
      setInlineError(t.usernameRequired)
      return
    }

    try {
      setOtpLoading(true)
      await authService.register({
        email,
        username,
        firstName: registrationForm.firstName.trim() || undefined,
        lastName: registrationForm.lastName.trim() || undefined,
      })
      setPendingVerificationEmail(email)
      setLoginIdentifier(email)
      setStep('verify-email')
      showNotice('success', t.registrationSuccess)
    } catch (error: any) {
      setInlineError(error?.message || 'Registration failed')
    } finally {
      setOtpLoading(false)
    }
  }

  const handleVerifyOtp = async (): Promise<void> => {
    setInlineError('')

    if (!otp) {
      setInlineError(t.otpRequired)
      return
    }

    const payload = { email: loginIdentifier.trim().toLowerCase() }

    try {
      setOtpLoading(true)
      const result = await authService.verifyOTP(payload, otp.trim())
      setCurrentUser(result.user)
      setIsAuthenticated(true)
      showNotice('success', 'Login successful.')

      if (selectedElectionId) {
        await prepareVotingFlow(selectedElectionId)
      } else {
        setStep('home')
      }
    } catch (error: any) {
      setInlineError(error?.message || 'Failed to verify OTP')
    } finally {
      setOtpLoading(false)
    }
  }

  const handleVerifyEmail = async (): Promise<void> => {
    setInlineError('')

    if (!otp) {
      setInlineError(t.otpRequired)
      return
    }

    try {
      setOtpLoading(true)
      await authService.verifyRegistration(pendingVerificationEmail, otp.trim())
      setOtp('')
      setAuthMode('login')
      setStep('auth')
      showNotice('success', 'Email verified. You can now login.')
    } catch (error: any) {
      setInlineError(error?.message || 'Failed to verify email')
    } finally {
      setOtpLoading(false)
    }
  }

  const handleResendVerification = async (): Promise<void> => {
    setInlineError('')
    const email = pendingVerificationEmail.trim().toLowerCase()
    if (!isValidEmail(email)) {
      setInlineError(t.emailRequired)
      return
    }

    try {
      setOtpLoading(true)
      await authService.resendVerification(email)
      showNotice('success', 'Verification code resent to your email.')
    } catch (error: any) {
      setInlineError(error?.message || 'Failed to resend verification code')
    } finally {
      setOtpLoading(false)
    }
  }


  const handleSubmitVote = async (): Promise<void> => {
    setInlineError('')

    if (!selectedElection) {
      setInlineError('Election data is not loaded')
      return
    }

    if (!selectedCandidateId) {
      setInlineError(t.chooseCandidateFirst)
      return
    }

    try {
      setVoteLoading(true)
      const result = await votingApi.submitVote({
        electionId: selectedElection.id,
        candidateId: selectedCandidateId,
      })

      setTransactionHash(result.transactionHash)
      setStep('success')
      showNotice('success', t.voteRecorded)

      if (showResults) {
        await loadResults(selectedElection.id)
      }
    } catch (error: any) {
      setInlineError(error?.message || 'Vote submission failed')
    } finally {
      setVoteLoading(false)
    }
  }

  const handleToggleResults = async (): Promise<void> => {
    if (!showResults && !resultsUnlocked) {
      showNotice('info', t.resultsLocked)
      return
    }

    const next = !showResults
    setShowResults(next)

    if (!next || !selectedElectionId) return
    await loadResults(selectedElectionId)
  }

  const toggleStarElection = (electionId: string): void => {
    setStarredElectionIds(current => {
      if (current.includes(electionId)) return current.filter(id => id !== electionId)
      return [...current, electionId]
    })
  }

  const handleCopyVoteLink = async (electionId: string): Promise<void> => {
    const voteUrl = `${window.location.origin}/vote/${electionId}`
    try {
      await navigator.clipboard.writeText(voteUrl)
      showNotice('success', t.linkCopied)
    } catch {
      showNotice('error', voteUrl)
    }
  }

  const handleDownloadResultsCsv = (): void => {
    if (!selectedPublicElection || resultCandidates.length === 0) return

    const header = [t.candidates, t.votesLabel, t.voteShareLabel]
    const body = resultCandidates.map(candidate => {
      const votes = candidate.voteCount || 0
      const share = totalVotes > 0 ? ((votes / totalVotes) * 100).toFixed(1) : '0.0'
      const fields = [localizeContent(candidate.name, language), String(votes), `${share}%`]
      return fields.map(field => `"${field.replace(/"/g, '""')}"`).join(',')
    })

    const csv = [header.map(field => `"${field}"`).join(','), ...body].join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    const fileNameBase = localizeContent(selectedPublicElection.title, language).replace(/[^\p{L}\p{N}_-]+/gu, '_')

    anchor.href = url
    anchor.download = `${fileNameBase || 'election'}_results.csv`
    document.body.appendChild(anchor)
    anchor.click()
    document.body.removeChild(anchor)
    URL.revokeObjectURL(url)
    showNotice('success', t.csvReady)
  }

  const handleReset = async (): Promise<void> => {
    setStep('home')
    setAuthMode('login')
    setSelectedCandidateId('')
    setTransactionHash('')
    setOtp('')
    setEligibilityReason('')
    setInlineError('')

    if (window.location.pathname.startsWith('/vote/')) {
      window.history.replaceState({}, '', '/')
    }

    await loadPublicElections()
  }

  const handleSignOut = async (): Promise<void> => {
    await authService.logout()
    setCurrentUser(null)
    setIsAuthenticated(false)
    setSelectedElection(null)
    setSelectedCandidateId('')
    setTransactionHash('')
    setLoginIdentifier('')
    setStep('landing')
    setAuthMode('login')
    showNotice('info', 'Signed out successfully.')
  }

  if (loading && publicElections.length === 0) {
    return (
      <div className="app">
        <main className="main">
          <section className="panel panel-center">
            <p>{t.loading}</p>
          </section>
        </main>
      </div>
    )
  }

  if (!isAuthenticated && step === 'landing') {
    return (
      <div className="app landing-mode">
        <header className="topbar">
          <div className="topbar-content">
            <div className="brand" onClick={() => setStep('landing')}>
              <span className="brand-mark" aria-hidden="true">
                <img src="/brand/app-icon-192.png" alt="" />
              </span>
              <div>
                <h1>{t.appTitle}</h1>
                <p>{t.tagline}</p>
              </div>
            </div>
            <div className="topbar-actions">
              <button className="language-btn" onClick={() => setLanguage(language === 'en' ? 'hi' : 'en')}>
                {language === 'en' ? 'हिंदी' : 'English'}
              </button>
              <button
                className="btn btn-soft"
                onClick={() => {
                  setAuthMode('login')
                  setStep('auth')
                }}
              >
                {t.loginNow}
              </button>
            </div>
          </div>
        </header>

        <main className="main">
          <section className="landing-hero">
            <div className="landing-copy">
              <div className="landing-badge-row">
                <span className="landing-badge">Private by Default</span>
                <span className="landing-badge">OTP Secured Access</span>
                <span className="landing-badge">Audit Ready</span>
              </div>
              <h2>{t.landingTitle}</h2>
              <p>{t.landingSubtitle}</p>
              <div className="button-group">
                <button
                  className="btn btn-primary"
                  onClick={() => {
                    setAuthMode('register')
                    setStep('auth')
                  }}
                >
                  {t.landingCta}
                </button>
                <button
                  className="btn btn-soft"
                  onClick={() => {
                    setAuthMode('login')
                    setStep('auth')
                  }}
                >
                  {t.landingSecondary}
                </button>
              </div>
            </div>

            <div className="landing-auth-shell">
              <div className="auth-shell-head">
                <h4>{t.secureGateway}</h4>
                <p>Only authenticated users can access election data.</p>
              </div>
              <div className="gateway-grid">
                <span>Email + OTP Sign-in</span>
                <span>Phone + OTP Sign-in</span>
                <span>Verified Account Layer</span>
                <span>One-Identity Policy</span>
              </div>
              <div className="auth-shell-note">
                <strong>Access Policy</strong>
                <p>Landing page shows product information only. Election details appear after secure login.</p>
              </div>
            </div>
          </section>

          <section className="landing-lower">
            <div className="landing-feature-grid">
              <article className="landing-feature-card">
                <h4>01.</h4>
                <p>{t.featureSecure}</p>
              </article>
              <article className="landing-feature-card">
                <h4>02.</h4>
                <p>{t.featureRealtime}</p>
              </article>
              <article className="landing-feature-card">
                <h4>03.</h4>
                <p>{t.featureVerifiable}</p>
              </article>
            </div>

            <div className="landing-timeline">
              <h3>{t.processTitle}</h3>
              <div className="timeline-steps">
                <article>
                  <strong>1</strong>
                  <p>Register profile with email and basic identity details.</p>
                </article>
                <article>
                  <strong>2</strong>
                  <p>Verify identity through OTP on chosen channel.</p>
                </article>
                <article>
                  <strong>3</strong>
                  <p>Participate in elections securely with an auditable trail.</p>
                </article>
              </div>
              <div className="gateway-card privacy-card">
                <h4>Privacy First Surface</h4>
                <p>
                  Public landing does not expose sensitive election content. Protected sections are unlocked only after user authentication.
                </p>
              </div>
            </div>
          </section>
        </main>
      </div>
    )
  }

  return (
    <div className="app">
      <header className="topbar">
        <div className="topbar-content">
          <div className="brand" onClick={() => setStep(isAuthenticated ? 'home' : 'landing')}>
            <span className="brand-mark" aria-hidden="true">
              <img src="/brand/app-icon-192.png" alt="" />
            </span>
            <div>
              <h1>{t.appTitle}</h1>
              <p>{t.tagline}</p>
            </div>
          </div>

          <div className="topbar-actions">
            <button className="language-btn" onClick={() => setLanguage(language === 'en' ? 'hi' : 'en')}>
              {language === 'en' ? 'हिंदी' : 'English'}
            </button>
            {isAuthenticated && currentUser && <span className="user-chip">{currentUser.email}</span>}
            {isAuthenticated && (
              <button className="btn btn-soft" onClick={() => void handleSignOut()}>
                {t.signOut}
              </button>
            )}
          </div>
        </div>
      </header>

      <main className="main">
        <section className="hero-panel">
          <div>
            <h2>{t.subtitle}</h2>
            <p>{t.professionalNote}</p>
          </div>
          <div className="hero-metrics">
            <article>
              <strong>{stats.active}</strong>
              <span>{t.activeNow}</span>
            </article>
            <article>
              <strong>{stats.candidates}</strong>
              <span>{t.candidates}</span>
            </article>
            <article>
              <strong>{stats.votes}</strong>
              <span>{t.totalVotes}</span>
            </article>
            <article>
              <strong>{starredElectionIds.length}</strong>
              <span>{t.filterStarred}</span>
            </article>
          </div>
        </section>

        <section className="workspace-grid">
          {isAuthenticated ? (
            <section className="panel election-panel">
            <div className="panel-head">
              <h3>{t.chooseElection}</h3>
              <button className="btn btn-soft" onClick={() => void loadPublicElections(selectedElectionId || undefined)}>
                Refresh
              </button>
            </div>
            <input
              className="input compact-input"
              type="text"
              placeholder={t.searchPlaceholder}
              value={electionSearch}
              onChange={event => setElectionSearch(event.target.value)}
            />
            <div className="filter-row">
              <button
                className={`filter-chip ${electionFilter === 'all' ? 'active' : ''}`}
                onClick={() => setElectionFilter('all')}
              >
                {t.filterAll}
              </button>
              <button
                className={`filter-chip ${electionFilter === 'active' ? 'active' : ''}`}
                onClick={() => setElectionFilter('active')}
              >
                {t.filterActive}
              </button>
              <button
                className={`filter-chip ${electionFilter === 'upcoming' ? 'active' : ''}`}
                onClick={() => setElectionFilter('upcoming')}
              >
                {t.filterUpcoming}
              </button>
              <button
                className={`filter-chip ${electionFilter === 'ended' ? 'active' : ''}`}
                onClick={() => setElectionFilter('ended')}
              >
                {t.filterEnded}
              </button>
              <button
                className={`filter-chip ${electionFilter === 'starred' ? 'active' : ''}`}
                onClick={() => setElectionFilter('starred')}
              >
                {t.filterStarred}
              </button>
            </div>

            {filteredPublicElections.length === 0 ? (
              <p className="muted-text">{electionSearch || electionFilter !== 'all' ? t.noElectionsFound : t.noActiveElections}</p>
            ) : (
              <div className="election-list">
                {filteredPublicElections.map(election => {
                  const isActive = selectedElectionId === election.id

                  return (
                    <button
                      key={election.id}
                      className={`election-card ${isActive ? 'active' : ''}`}
                      onClick={() => setSelectedElectionId(election.id)}
                    >
                      <div className="election-card-head">
                        <h4>{localizeContent(election.title, language)}</h4>
                        <span
                          className={`star-btn ${starredElectionIds.includes(election.id) ? 'active' : ''}`}
                          onClick={event => {
                            event.stopPropagation()
                            toggleStarElection(election.id)
                          }}
                          onKeyDown={event => {
                            if (event.key === 'Enter' || event.key === ' ') {
                              event.preventDefault()
                              event.stopPropagation()
                              toggleStarElection(election.id)
                            }
                          }}
                          role="button"
                          tabIndex={0}
                          aria-label={t.filterStarred}
                        >
                          {starredElectionIds.includes(election.id) ? '★' : '☆'}
                        </span>
                      </div>
                      <p>{localizeContent(election.description, language) || t.noDescription}</p>
                      <div className="election-meta">
                        <span>
                          {t.candidates}: {election.candidateCount}
                        </span>
                        <span>
                          {t.totalVotes}: {election.totalVotesCast}
                        </span>
                      </div>
                      <div className="election-meta">
                        <span>{formatDateTime(election.startTime)}</span>
                        <span>{formatDateTime(election.endTime)}</span>
                      </div>
                    </button>
                  )
                })}
              </div>
            )}

            {selectedPublicElection && (
              <div className="election-detail">
                <h4>{t.electionDetails}</h4>
                <p>{localizeContent(selectedPublicElection.title, language)}</p>
                <span>
                  {t.electionWindow}: {formatDateTime(selectedPublicElection.startTime)} -{' '}
                  {formatDateTime(selectedPublicElection.endTime)}
                </span>
                <button
                  className="btn btn-soft btn-mini"
                  onClick={() => void handleCopyVoteLink(selectedPublicElection.id)}
                >
                  {t.copyVoteLink}
                </button>
              </div>
            )}
            </section>
          ) : (
            <section className="panel panel-center locked-panel">
              <h3>{t.authTitle}</h3>
              <p className="muted-text">{t.loginRequired}</p>
              <div className="button-group">
                <button
                  className="btn btn-primary"
                  onClick={() => {
                    setAuthMode('login')
                    setStep('auth')
                  }}
                >
                  {t.loginNow}
                </button>
                <button
                  className="btn btn-soft"
                  onClick={() => {
                    setAuthMode('register')
                    setStep('auth')
                  }}
                >
                  {t.registerNow}
                </button>
              </div>
            </section>
          )}

          <section className="panel journey-panel">
            <h3>{t.stepsTitle}</h3>
            <div className="journey-list">
              <div className={`journey-item ${step === 'home' ? 'current' : ''}`}>{t.stepOne}</div>
              <div className={`journey-item ${step === 'auth' || step === 'verify-email' || step === 'otp' ? 'current' : ''}`}>
                {t.stepTwo}
              </div>
              <div className={`journey-item ${step === 'voting' || step === 'success' ? 'current' : ''}`}>{t.stepThree}</div>
            </div>

            {inlineError && <div className="inline-alert error">{inlineError}</div>}
            {eligibilityReason && !inlineError && <div className="inline-alert info">{eligibilityReason}</div>}

            {step === 'home' && (
              <div className="stage-card">
                <h4>{selectedPublicElection ? localizeContent(selectedPublicElection.title, language) : t.chooseElection}</h4>
                <p>{selectedPublicElection ? localizeContent(selectedPublicElection.description, language) : t.professionalNote}</p>
                {selectedPublicElection && (
                  <div className="insight-grid">
                    <article className="insight-tile">
                      <span>{t.electionClock}</span>
                      <strong>{electionClock || '-'}</strong>
                    </article>
                    <article className="insight-tile">
                      <span>{t.trustIndex}</span>
                      <strong>{trustIndex}/100</strong>
                    </article>
                  </div>
                )}
                <div className="button-group">
                  <button className="btn btn-primary" onClick={() => void handleProceedToVote()} disabled={!selectedElectionId || loading}>
                    {t.proceedToVote}
                  </button>
                  <button
                    className="btn btn-soft"
                    onClick={() => void handleToggleResults()}
                    disabled={!selectedElectionId || loading || !resultsUnlocked}
                  >
                    {showResults ? t.hideResults : t.viewResults}
                  </button>
                </div>
                {selectedElectionId && !resultsUnlocked && <p className="muted-text status-note">{t.resultsLocked}</p>}
                {selectedElectionId && resultsUnlocked && <p className="muted-text status-note">{t.resultsReady}</p>}
              </div>
            )}

            {step === 'auth' && (
              <div className="stage-card">
                <div className="auth-toggle">
                  <button className={`auth-tab ${authMode === 'login' ? 'active' : ''}`} onClick={() => setAuthMode('login')}>
                    {t.loginNow}
                  </button>
                  <button className={`auth-tab ${authMode === 'register' ? 'active' : ''}`} onClick={() => setAuthMode('register')}>
                    {t.registerNow}
                  </button>
                </div>

                {authMode === 'login' ? (
                  <>
                    <h4>{t.authTitle}</h4>
                    <input
                      className="input"
                      type="email"
                      placeholder={t.identifierPlaceholderPhone}
                      value={loginIdentifier}
                      onChange={event => setLoginIdentifier(event.target.value)}
                    />
                    <div className="button-group">
                      <button className="btn btn-soft" onClick={() => setStep('landing')}>
                        {t.back}
                      </button>
                      <button className="btn btn-primary" onClick={() => void handleRequestOtp()} disabled={otpLoading}>
                        {otpLoading ? t.loading : t.requestOtp}
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    <h4>{t.registerNow}</h4>
                    <div className="form-grid">
                      <input
                        className="input"
                        type="email"
                        placeholder={t.emailPlaceholder}
                        value={registrationForm.email}
                        onChange={event => setRegistrationForm(current => ({ ...current, email: event.target.value }))}
                      />
                      <input
                        className="input"
                        type="text"
                        placeholder={t.usernamePlaceholder}
                        value={registrationForm.username}
                        onChange={event => setRegistrationForm(current => ({ ...current, username: event.target.value }))}
                      />
                      <input
                        className="input"
                        type="text"
                        placeholder={t.firstNamePlaceholder}
                        value={registrationForm.firstName}
                        onChange={event => setRegistrationForm(current => ({ ...current, firstName: event.target.value }))}
                      />
                      <input
                        className="input"
                        type="text"
                        placeholder={t.lastNamePlaceholder}
                        value={registrationForm.lastName}
                        onChange={event => setRegistrationForm(current => ({ ...current, lastName: event.target.value }))}
                      />
                    </div>
                    <div className="button-group">
                      <button className="btn btn-soft" onClick={() => setStep('landing')}>
                        {t.back}
                      </button>
                      <button className="btn btn-primary" onClick={() => void handleRegister()} disabled={otpLoading}>
                        {otpLoading ? t.loading : t.registerNow}
                      </button>
                    </div>
                  </>
                )}
              </div>
            )}

            {step === 'verify-email' && (
              <div className="stage-card">
                <h4>Email Verification</h4>
                <p className="muted-text">Enter the verification code sent to your email.</p>
                <p className="mail-label">{pendingVerificationEmail}</p>
                <input
                  className="input otp-input"
                  type="text"
                  maxLength={6}
                  placeholder={t.otpPlaceholder}
                  value={otp}
                  onChange={event => setOtp(event.target.value.trim())}
                />
                <div className="button-group">
                  <button className="btn btn-soft" onClick={() => setStep('auth')}>
                    {t.back}
                  </button>
                  <button className="btn btn-primary" onClick={() => void handleVerifyEmail()} disabled={otpLoading}>
                    {otpLoading ? t.loading : 'Verify Email'}
                  </button>
                  <button className="btn btn-soft" onClick={() => void handleResendVerification()} disabled={otpLoading}>
                    Resend Code
                  </button>
                </div>
              </div>
            )}

            {step === 'otp' && (
              <div className="stage-card">
                <h4>{t.verifyOtp}</h4>
                <p className="muted-text">{t.waitingOtp}</p>
                <p className="mail-label">{loginIdentifier}</p>
                <input
                  className="input otp-input"
                  type="text"
                  inputMode="numeric"
                  maxLength={6}
                  placeholder={t.otpPlaceholder}
                  value={otp}
                  onChange={event => setOtp(event.target.value.replace(/\D/g, ''))}
                />
                <div className="button-group">
                  <button className="btn btn-soft" onClick={() => setStep('auth')}>
                    {t.back}
                  </button>
                  <button className="btn btn-primary" onClick={() => void handleVerifyOtp()} disabled={otpLoading}>
                    {otpLoading ? t.loading : t.verifyOtp}
                  </button>
                </div>
              </div>
            )}

            {step === 'voting' && (
              <div className="stage-card">
                <h4>{t.votingTitle}</h4>
                <p className="muted-text">{selectedElection ? localizeContent(selectedElection.title, language) : ''}</p>
                <p className="muted-text">{t.selectCandidateHint}</p>

                <div className="candidates-section">
                  {(selectedElection?.candidates || []).map(candidate => {
                    const active = candidate.id === selectedCandidateId
                    return (
                      <article
                        key={candidate.id}
                        className={`candidate-card ${active ? 'selected' : ''}`}
                        onClick={() => setSelectedCandidateId(candidate.id)}
                      >
                        <div className="candidate-info">
                          <div className="candidate-avatar">{getCandidateInitials(localizeContent(candidate.name, language))}</div>
                          <div className="candidate-details">
                            <h5>{localizeContent(candidate.name, language)}</h5>
                            <p>{localizeContent(candidate.description, language) || t.candidateFallback}</p>
                          </div>
                        </div>
                        <div className={`radio ${active ? 'checked' : ''}`}>{active ? '✓' : ''}</div>
                      </article>
                    )
                  })}
                </div>

                <div className="button-group">
                  <button className="btn btn-soft" onClick={() => setStep('home')}>
                    {t.back}
                  </button>
                  <button className="btn btn-success" onClick={() => void handleSubmitVote()} disabled={voteLoading}>
                    {voteLoading ? t.loading : t.proceedToVote}
                  </button>
                </div>
              </div>
            )}

            {step === 'success' && (
              <div className="stage-card success-card">
                <h4>{t.voteSuccessTitle}</h4>
                <p>{t.voteSuccessSubtitle}</p>
                {transactionHash && <p className="transaction-id">Tx: {truncateHash(transactionHash)}</p>}
                <div className="button-group">
                  <button className="btn btn-primary" onClick={() => void handleReset()}>
                    {t.finish}
                  </button>
                </div>
              </div>
            )}
          </section>
        </section>

        {showResults && (
          <section className="panel results-panel">
            <div className="panel-head">
              <div className="panel-head-col">
                <h3>{t.viewResults}</h3>
                <p className="muted-text">{selectedPublicElection ? localizeContent(selectedPublicElection.title, language) : ''}</p>
              </div>
              <button
                className="btn btn-soft"
                onClick={handleDownloadResultsCsv}
                disabled={!isAuthenticated || resultCandidates.length === 0}
              >
                {t.exportCsv}
              </button>
            </div>

            {!isAuthenticated ? (
              <p className="muted-text">{t.loginForResults}</p>
            ) : resultCandidates.length === 0 ? (
              <p className="muted-text">{t.noResultsYet}</p>
            ) : (
              <>
                <div className="results-summary">
                  <strong>
                    {t.totalVotes}: {totalVotes}
                  </strong>
                </div>
                {resultInsights && (
                  <div className="results-insights">
                    <article className="insight-tile">
                      <span>{t.leaderMargin}</span>
                      <strong>
                        {resultInsights.marginVotes} {t.votesLabel} ({resultInsights.marginPercentage.toFixed(1)}%)
                      </strong>
                    </article>
                    <article className="insight-tile">
                      <span>{t.competitionLevel}</span>
                      <strong>{resultInsights.competitionLabel}</strong>
                    </article>
                  </div>
                )}
                <div className="results-list">
                  {resultCandidates.map(candidate => {
                    const candidateVotes = candidate.voteCount || 0
                    const percentage = totalVotes > 0 ? (candidateVotes / totalVotes) * 100 : 0
                    const maxVotes = Math.max(...resultCandidates.map(item => item.voteCount || 0))
                    const isWinner = candidateVotes === maxVotes && maxVotes > 0

                    return (
                      <article key={candidate.id} className={`result-item ${isWinner ? 'winner' : ''}`}>
                        <div className="result-header">
                          <div>
                            <h4>
                              {localizeContent(candidate.name, language)}
                              {isWinner ? <span className="winner-badge">{t.winner}</span> : null}
                            </h4>
                            <p>{localizeContent(candidate.description, language) || t.independent}</p>
                          </div>
                          <div className="result-stats">
                            <div className="result-stat-line">
                              <span>{t.votesLabel}:</span>
                              <strong>{candidateVotes}</strong>
                            </div>
                            <div className="result-stat-line">
                              <span>{t.voteShareLabel}:</span>
                              <strong>{percentage.toFixed(1)}%</strong>
                            </div>
                          </div>
                        </div>
                        <div className="progress-bar">
                          <div className={`progress-fill ${isWinner ? 'winner' : ''}`} style={{ width: `${percentage}%` }} />
                        </div>
                      </article>
                    )
                  })}
                </div>
              </>
            )}
          </section>
        )}
      </main>

      <footer className="footer">
        <div className="footer-content">
          <p>JANADESH • Backend API + PostgreSQL + Blockchain Verification</p>
        </div>
      </footer>

      {notice && <div className={`notice-toast ${notice.tone}`}>{notice.message}</div>}
    </div>
  )
}

export default App
