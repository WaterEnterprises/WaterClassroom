import { LESSONS, QUIZZES } from './lessonsData';
import type { Lesson, Quiz, StudentProgress, Task, ChatMessage } from './types';

// ---------- Custom Types ----------
export interface TursoRecord {
  id: string;
  type: string;
  name: string;
  email: string;
  representative: string;
  academicTrack: string;
  studentVolume: number;
  kindOfSchool: string;
  billingCycle: string;
  calculatedPrice: string;
  registeredAt: string;
  dbStatus: string;
  passcode?: string;
  affiliatedCode?: string;
  isActivated?: boolean | number;
  checkoutUrl?: string | null;
}

export interface ForumPost {
  id: string;
  author: string;
  userLevel: number;
  title: string;
  content: string;
  likes: number;
  replies: number;
  category: string;
}

// ---------- Helpers ----------
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// ---------- URL Routing ----------
const ROUTE_MAP: Record<string, string> = {
  '/': 'dashboard',
  '/dashboard': 'dashboard',
  '/school': 'dashboard',
  '/academy': 'academy',
  '/tutor': 'tutor',
  '/tasks': 'tasks',
  '/profile': 'profile',
  '/forums': 'collaborate',
  '/messages': 'messages',
};

const REVERSE_ROUTE: Record<string, string> = {
  'dashboard': '/dashboard',
  'academy': '/academy',
  'tutor': '/tutor',
  'tasks': '/tasks',
  'profile': '/profile',
  'collaborate': '/forums',
  'messages': '/messages',
};

function getPathFromTab(tab: string): string {
  return REVERSE_ROUTE[tab] || '/dashboard';
}

function getTabFromPath(path: string): string {
  if (path === "/join" || path.startsWith("/join/")) return "dashboard";
  return ROUTE_MAP[path] || "dashboard";
}

// ─── Student invite deep-link (/join/STU-XXXXXX or ?invite=STU-XXXXXX) ───
// Runs on boot: pre-fills Register mode + code, then validates via lookup.
export async function lookupInviteCode(code: string) {
  const clean = (code || "").trim().toUpperCase();
  if (!clean) {
    appState.inviteLookup = { status: "idle", kind: "", schoolName: "", studentName: "", gradeLevel: "", error: "" };
    return appState.inviteLookup;
  }
  appState.inviteLookup = { status: "checking", kind: "", schoolName: "", studentName: "", gradeLevel: "", error: "" };
  try {
    const res = await fetch(`/api/invites/${encodeURIComponent(clean)}/lookup`);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      appState.inviteLookup = { status: "invalid", kind: "", schoolName: "", studentName: "", gradeLevel: "", error: data.error || "Invite code not found." };
    } else {
      const kind = data.kind === "tutor" ? "tutor" : "student";
      appState.inviteLookup = { status: "valid", kind, schoolName: data.school_name || "", studentName: data.student_name || "", gradeLevel: data.grade_level || "", error: "" };
      if (data.student_name && !appState.regName) appState.regName = data.student_name;
      // Tutor links switch the form into tutor mode (student links keep student mode).
      if (kind === "tutor") appState.landingAuthRole = "tutor";
    }
  } catch {
    appState.inviteLookup = { status: "invalid", kind: "", schoolName: "", studentName: "", gradeLevel: "", error: "Network error — please try again." };
  }
  return appState.inviteLookup;
}

export function consumeInviteFromUrl() {
  if (typeof window === "undefined") return;
  try {
    const url = new URL(window.location.href);
    let code = "";
    const joinMatch = url.pathname.match(/^\/join\/([A-Za-z0-9-]+)\/?$/);
    if (joinMatch) code = joinMatch[1];
    if (!code) code = url.searchParams.get("invite") || url.searchParams.get("code") || "";
    code = code.trim().toUpperCase();
    if (!code) {
      // No code in URL — restore a previously opened invite code into the field (no mode switch).
      try {
        const stored = (localStorage.getItem("wc_invite_code") || "").trim().toUpperCase();
        if (stored && !appState.schoolEnrollCode) appState.schoolEnrollCode = stored;
      } catch { /* ignore */ }
      return;
    }
    appState.inviteCodeFromUrl = code;
    appState.landingAuthMode = "register";
    appState.landingAuthRole = "water-student";
    appState.schoolEnrollCode = code;
    try { localStorage.setItem("wc_invite_code", code); } catch { /* ignore */ }
    lookupInviteCode(code);
    // Clean the URL (keep the user on a canonical path, code stays in the form).
    try { window.history.replaceState({ tab: "dashboard" }, "", "/"); } catch { /* ignore */ }
  } catch { /* ignore malformed URLs */ }
}

const ONBOARDING_STORAGE_KEY = "wc_onboarding_state";

function loadOnboardingState(): Record<string, any> {
  try {
    const raw = localStorage.getItem(ONBOARDING_STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch { return {}; }
}

function saveOnboardingState(partial: Record<string, any>) {
  try {
    const current = loadOnboardingState();
    localStorage.setItem(ONBOARDING_STORAGE_KEY, JSON.stringify({ ...current, ...partial }));
  } catch { /* ignore */ }
}

function clearOnboardingState() {
  try { localStorage.removeItem(ONBOARDING_STORAGE_KEY); } catch { /* ignore */ }
}

// ---------- Favorite tracks (Academy — localStorage, per device) ----------
const FAV_TRACKS_KEY = "wc_fav_tracks";

function loadFavTracks(): string[] {
  try {
    const raw = localStorage.getItem(FAV_TRACKS_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((x) => typeof x === "string") : [];
  } catch { return []; }
}

function saveFavTracks(ids: string[]) {
  try { localStorage.setItem(FAV_TRACKS_KEY, JSON.stringify(ids)); } catch { /* ignore */ }
}

// ---------- Session Persistence ----------
const SESSION_KEY = "wc_session";

function loadSession(): Record<string, any> {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch { return {}; }
}

function saveSession() {
  try {
    localStorage.setItem(SESSION_KEY, JSON.stringify({
      isLoggedIn: appState.isLoggedIn,
      studentName: appState.studentName,
      studentTrack: appState.studentTrack,
      loginEmail: appState.loginEmail,
      landingAuthRole: appState.landingAuthRole,
      isUserActivated: appState.isUserActivated,
      hasSystemPermission: appState.hasSystemPermission,
      isOnboarded: appState.isOnboarded,
      isOnboardingComplete: appState.isOnboardingComplete,
      onboardingCurriculum: appState.onboardingCurriculum,
      selectedOnboardingTrackId: appState.selectedOnboardingTrackId,
    }));
  } catch { /* ignore */ }
}

function clearSession() {
  try { localStorage.removeItem(SESSION_KEY); } catch { /* ignore */ }
}

function validateEmail(email: string): string | undefined {
  if (!email.trim()) return "Email address is required.";
  if (!EMAIL_REGEX.test(email.trim())) return "Please enter a valid email address (e.g. user@example.com).";
  return undefined;
}

function validatePassword(pw: string): string | undefined {
  if (!pw) return "Password is required.";
  if (pw.length < 6) return "Password must be at least 6 characters.";
  if (pw.length > 128) return "Password must be under 128 characters.";
  return undefined;
}

// ---------- Init ----------
const initOnb = loadOnboardingState();
const initSession = loadSession();

// Initialize tab from URL
const initialPath = typeof window !== 'undefined' ? window.location.pathname : '/dashboard';
const initialTab = getTabFromPath(initialPath);

// ---------- Navigation ----------
export function navigateTo(tab: string) {
  appState.activeTab = tab;
  const path = getPathFromTab(tab);
  if (window.location.pathname !== path) {
    window.history.pushState({ tab }, '', path);
  }
}

// Handle browser back/forward
if (typeof window !== 'undefined') {
  window.addEventListener('popstate', (e) => {
    const tab = e.state?.tab || getTabFromPath(window.location.pathname);
    appState.activeTab = tab;
  });
}

// ---------- State ----------
export const appState = $state({
  // Tab Navigation
  activeTab: initialTab,
  isLoggedIn: initSession.isLoggedIn || false,
  studentName: initSession.studentName || "",
  studentTrack: initSession.studentTrack || "",
  loginEmail: initSession.loginEmail || "",
  kindOfSchool: (initSession as any).kindOfSchool || "",
  loginAccessKey: "",
  isUserActivated: initSession.isUserActivated || false,
  hasSystemPermission: initSession.hasSystemPermission || false,

  // Landing Auth
  landingAuthRole: (initSession.landingAuthRole || initOnb.landingAuthRole || "water-student") as "water-student" | "independent-student" | "school-student" | "tutor" | "institution",
  landingAuthMode: "login" as "login" | "register",
  landingAuthErrors: {} as { email?: string; password?: string; form?: string; name?: string; schoolName?: string; repName?: string },
  // Student invite deep-link (/join/STU-XXXXXX or /join/TUT-XXXXXX)
  inviteCodeFromUrl: "" as string,
  inviteLookup: { status: "idle", kind: "", schoolName: "", studentName: "", gradeLevel: "", error: "" } as {
    status: "idle" | "checking" | "valid" | "invalid";
    kind: "" | "student" | "tutor"; schoolName: string; studentName: string; gradeLevel: string; error: string;
  },
  regName: "",
  regSchoolName: "",
  regRepName: "",
  regStudentVolume: 1,
  regBillingCycle: "Monthly",
  tursoRecords: [] as TursoRecord[],
  tursoSuccessMsg: "",
  tursoLoading: false,
  showLoginModal: false,
  modalRole: "student" as "student" | "school",

  // Progress
  progress: {
    points: 0,
    streakDays: 0,
    level: 1,
    completedLessons: [] as string[],
    unlockedBadges: [] as string[],
    lastActiveDate: new Date().toISOString().split("T")[0]
  } as StudentProgress,

  // Gamification display state
  streakDisplay: 0,
  currentLevel: 1,
  totalPoints: 0,
  badgeCollection: [] as string[],
  recentBadges: [] as string[],
  nextBadgeToEarn: "" as string,
  nextBadgeProgress: 0,
  subjectProgress: {} as Record<string, number>,

  // Curriculum
  selectedCurriculum: "all",
  onboardingCurriculum: initSession.onboardingCurriculum || initOnb.onboardingCurriculum || "US Common Core",
  institutionCode: "",
  isOnboarded: initSession.isOnboarded || initOnb.isOnboarded || false,
  joinedClassroom: null as string | null,
  currentTrackId: "" as string,
  currentTrackDisplayName: "" as string,
  trackLessons: [] as Array<{ id: string; title: string; lesson_type: string; estimated_minutes: number; subject: string; grade_level: string; content_ref: string }>,
  availableTracks: [] as Array<{ id: string; country_code: string; grade_level: string; display_name: string }>,
  countryCatalog: [] as Array<{ code: string; name: string }>,
  isCurriculumLoading: false,
  curriculumError: "" as string,

  // New Onboarding Wizard
  onboardingStep: initOnb.onboardingStep || 1,
  isOnboardingComplete: initSession.isOnboardingComplete || initOnb.isOnboardingComplete || false,
  studentProgramId: initOnb.studentProgramId || "",
  studentGradeLevelId: initOnb.studentGradeLevelId || "",
  enrollmentType: initOnb.enrollmentType || "",
  schoolEnrollCode: initOnb.schoolEnrollCode || "",
  showPaymentScreen: initOnb.showPaymentScreen || false,
  studentBillingCycle: ((initOnb.studentBillingCycle as "monthly" | "yearly") || "monthly") as "monthly" | "yearly",
  studentCountry: initOnb.studentCountry || "",
  studentTrackType: initOnb.studentTrackType || "",

  // Institution admin
  institutionId: "" as string,
  institutionName: "" as string,
  institutionGradeRange: "K-12",
  institutionStudents: [] as Array<{ id: string; name: string; email: string; grade_level: string; points: number; streak_days: number; last_active: string }>,
  institutionInvites: [] as Array<{ id: string; name: string; email: string; grade_level: string; invite_code: string; status: string; claimed_name: string; created_at: string; claimed_at: string }>,
  institutionTutorInvites: [] as Array<{ id: string; name: string; email: string; subjects: string[]; invite_code: string; status: string; claimed_name: string; created_at: string; claimed_at: string; expires_at: string; last_emailed_at: string; email_status: string; invite_link: string }>,
  // Tutor workspace: classes assigned to the logged-in tutor, with students.
  tutorClasses: [] as Array<{ id: string; title: string; subject: string; grade_level: string; institution_name: string; has_quiz: boolean; students: Array<any> }>,
  isTutorClassesLoading: false,
  // Students screen (institution): tracks → grades → students + quiz scores.
  studentsSummary: [] as Array<any>,
  isStudentsSummaryLoading: false,
  institutionTutors: [] as Array<{ id: string; name: string; email: string; subjects: string[]; grade_levels: string[] }>,
  // Seat-based billing: paid student spots vs consumed.
  institutionSeats: { paid: 50, used: 0 } as { paid: number; used: number },
  // Profile → Payments: seat purchase ledger + this-month totals.
  seatPurchases: [] as Array<{ id: string; spots: number; billing_cycle: string; amount_cents: number; created_at: string }>,
  seatMonth: { year: 0, month: 0, spots: 0, amount_cents: 0 } as { year: number; month: number; spots: number; amount_cents: number },
  isSeatPurchasesLoading: false,
  isAdminLoading: false,
  adminError: "" as string,
  assignedTutorId: "" as string,

  // Community
  communityPosts: [] as Array<{ id: string; author_name: string; author_level: number; title: string; content: string; likes: number; replies: number; category: string; created_at: string }>,
  // Open thread + its replies
  activeThread: null as null | { id: string; author_name: string; author_level: number; title: string; content: string; likes: number; replies: number; category: string; created_at: string },
  threadReplies: [] as Array<{ id: string; post_id: string; author_name: string; author_level: number; content: string; likes: number; created_at: string }>,
  newReplyContent: "" as string,
  isThreadLoading: false,
  isSendingReply: false,
  threadError: "" as string,
  activeCommunityTopic: "grade-all" as string,
  activeCommunitySubject: "" as string,
  communityTopics: [] as Array<{ id: string; label: string; subtopics: string[] }>,
  isSubmittingPost: false,
  postSubmitError: "" as string,
  postSubmitNotice: "" as string,

  // Academy / Lessons
  selectedLesson: null as Lesson | null,
  activeQuiz: null as Quiz | null,
  quizAnswers: [] as number[],
  showQuizResult: false,

  // Class Studio / Onboarding class catalog
  availableClasses: [] as Array<{ id: string; track_id: string; title: string; description: string; subject: string; grade_level: string; estimated_minutes: number; game_path: string; has_quiz?: boolean }>,
  availableTracks: [] as Array<{ id: string; name: string; description: string; grade_level: string; subject: string; country_code?: string; institution_id?: string; institution_name?: string; class_count?: number }>,
  // Academy browsing: the logged-in user's institution (school classes first).
  myInstitution: null as null | { id: string; name: string },
  // Academy browse tree: published tracks with nested grades → courses → lessons.
  browseTree: [] as Array<any>,
  isBrowseTreeLoading: false,
  // Academy: favorite (starred) track ids — persisted per device.
  favoriteTrackIds: loadFavTracks() as string[],
  joinedClassTitles: [] as string[],
  joinedClasses: [] as Array<{ id: string; title: string; subject: string; grade_level: string; institution_name: string; enrolled_at: string }>,
  // Runtime studio lesson (JSON via view endpoint — no build step)
  activeStudioLesson: null as null | { id: string; track_id: string; title: string; description: string; subject: string; grade_level: string; estimated_minutes: number; game_path: string; content_html: string; quiz_markdown: string },
  isStudioLessonLoading: false,
  studioLessonError: "" as string,
  isClassesLoading: false,
  selectedOnboardingTrackId: (initSession as any).selectedOnboardingTrackId || "" as string,
  quizScore: 0,
  currentLessonComponent: null as LessonComponent | null,
  currentLessonHash: "" as string,
  isLessonLoading: false,
  lessonError: "" as string,

  // Proctoring
  isExamProctoring: false,
  cameraPermissionGranted: false,
  examTimer: 600,
  proctorLogs: [
    "Proctor AI Core VLM Loaded.",
    "Awaiting camera sensor authorization..."
  ] as string[],
  verifiedExamsList: [] as Array<{ id: string; lessonTitle: string; hash: string; score: string; timestamp: string }>,
  videoEl: null as HTMLVideoElement | null,
  streamRef: null as MediaStream | null,
  activeExamAttemptId: "" as string,
  currentExamQuestions: [] as Array<{ id: string; text: string; options: string[]; correctAnswerIndex: number }>,
  examScore: null as number | null,
  examPassed: false,
  proctorExamStatus: "not_started" as "not_started" | "in_progress" | "flagged" | "verified" | "voided",
  proctorFlagsSummary: [] as string[],
  cameraStreamActive: false,

  // Games
  activeGame: null as string | null,
  trinityGood: 60,
  trinityMoney: 40,
  trinityFun: 50,
  trinityWinner: false,
  robotHip: 45,
  robotKnee: 100,
  robotAnkle: 120,
  robotBalanced: false,
  incBase: 2000,
  incRevenue: 50000,
  incCosts: 20000,
  incKwhPrice: 0.25,

  // AI Tutor
  chatMessages: [] as ChatMessage[],
  chatInput: "",
  chatBottomEl: null as HTMLDivElement | null,
  isTutorTyping: false,

  // Forums
  forumPosts: [] as ForumPost[],
  newPostTitle: "",
  newPostContent: "",
  newPostCategory: "General",
  // Direct messages (users ↔ tutors ↔ school).
  dmConversations: [] as Array<{ user_id: string; name: string; type: string; last_content: string; last_at: string; last_from_me: boolean; unread: number }>,
  dmUnreadTotal: 0,
  dmDirectory: [] as Array<{ id: string; name: string; email: string; type: string }>,
  dmOther: null as null | { id: string; name: string; type: string },
  dmMessages: [] as Array<{ id: string; sender_id: string; content: string; is_read: boolean; created_at: string }>,
  dmInput: "" as string,
  dmRecipientId: "" as string,
  isDMsLoading: false,
  isDMSending: false,
  dmError: "" as string,

  // Tasks
  tasks: [] as Task[],
  isCreatingTask: false,
  newTaskTitle: "",
  newTaskDesc: "",
  newTaskCategory: "Policy",
  newTaskReward: 1200,

  // Contact / Calculator
  contactName: "",
  contactEmail: "",
  contactMsg: "",
  contactConfirmed: false,
  isSendingContact: false,
  sendingStatus: "",
  contactErrorMsg: "",
  calcStudents: 0,
  calcBilling: "monthly" as "monthly" | "yearly",
  calcCustomSupport: false,

  // FAQ
  expandedFaq: null as number | null,

  // Donate
  showDirectDonateModal: false,
  simulatedDonationAmount: "100",
  donationSuccess: false,

  // Derived
  get filteredLessons() {
    return appState.selectedCurriculum === "all"
      ? LESSONS
      : LESSONS.filter(l => l.curriculum === appState.selectedCurriculum);
  },
});

// ---------- Setters ----------
// Deep-link invite (?invite= / /join/:code) — runs once on boot, after state exists.
if (typeof window !== 'undefined') {
  try { consumeInviteFromUrl(); } catch { /* ignore */ }
}

export function setActiveTab(v: string) { appState.activeTab = v; }
export function setIsLoggedIn(v: boolean) { appState.isLoggedIn = v; if (!v) { clearSession(); fetch("/api/logout", { method: "POST" }).catch(() => {}); } else saveSession(); }
export function setStudentName(v: string) { appState.studentName = v; }
export function setStudentTrack(v: string) { appState.studentTrack = v; }
export function setLoginEmail(v: string) { appState.loginEmail = v; }
export function setLoginAccessKey(v: string) { appState.loginAccessKey = v; }
export function setIsUserActivated(v: boolean) { appState.isUserActivated = v; saveSession(); }
export function setLandingAuthRole(v: typeof appState.landingAuthRole) { appState.landingAuthRole = v; }
export function setLandingAuthMode(v: typeof appState.landingAuthMode) { appState.landingAuthMode = v; }
export function setLandingAuthErrors(v: typeof appState.landingAuthErrors) { appState.landingAuthErrors = v; }
export function setRegName(v: string) { appState.regName = v; }
export function setRegSchoolName(v: string) { appState.regSchoolName = v; }
export function setRegRepName(v: string) { appState.regRepName = v; }
export function setRegStudentVolume(v: number) { appState.regStudentVolume = v; }
export function setRegBillingCycle(v: string) { appState.regBillingCycle = v; }
export function setTursoRecords(v: TursoRecord[]) { appState.tursoRecords = v; }
export function setTursoSuccessMsg(v: string) { appState.tursoSuccessMsg = v; }
export function setTursoLoading(v: boolean) { appState.tursoLoading = v; }
export function setProgress(v: StudentProgress) { appState.progress = v; }
export function setSelectedCurriculum(v: string) { appState.selectedCurriculum = v; }
export function setOnboardingCurriculum(v: string) { appState.onboardingCurriculum = v; saveSession(); }
export function setIsOnboarded(v: boolean) { appState.isOnboarded = v; saveSession(); }

export function setIsOnboardingComplete(v: boolean) { appState.isOnboardingComplete = v; saveSession(); }
export function setStudentCountry(v: string) { appState.studentCountry = v; }

// ---------- Class Studio / Onboarding class catalog ----------
export async function fetchAvailableClasses() {
  appState.isClassesLoading = true;
  try {
    const [tracksRes, classesRes] = await Promise.all([
      fetch("/api/studio/available-tracks"),
      fetch("/api/studio/available-classes"),
    ]);
    if (tracksRes.ok) {
      const data = await tracksRes.json();
      appState.availableTracks = data.tracks || [];
    }
    if (classesRes.ok) {
      const data = await classesRes.json();
      appState.availableClasses = data.classes || [];
    }
  } catch (err) {
    console.warn("Failed to load available classes:", err);
  } finally {
    appState.isClassesLoading = false;
  }
}

// Report a studio-class quiz result (or plain completion) so the institution sees per-student progress.
export async function reportClassResult(classId: string, score: number, total: number, completion = false): Promise<any | null> {
  try {
    const res = await fetch("/api/progress/class-result", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({ class_id: classId, score, total, completion }),
    });
    if (!res.ok) return null;
    return await res.json().catch(() => ({}));
  } catch {
    return null;
  }
}

export function setSelectedOnboardingTrackId(v: string) {
  appState.selectedOnboardingTrackId = v;
}

// Academy: star/unstar a Water Classroom track (favorites survive reloads).
export function toggleFavoriteTrack(trackId: string) {
  const ids = appState.favoriteTrackIds.includes(trackId)
    ? appState.favoriteTrackIds.filter((id) => id !== trackId)
    : [...appState.favoriteTrackIds, trackId];
  appState.favoriteTrackIds = ids;
  saveFavTracks(ids);
}

// Student joins a single institution class directly by its join code.
export async function joinClassByCode(code: string): Promise<{ ok: boolean; error?: string; classTitle?: string }> {
  const clean = (code || "").trim();
  if (!clean) return { ok: false, error: "Enter a class code first." };
  try {
    const res = await fetch("/api/institution/curriculum/join-class", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({ code: clean }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, error: data.error || `Join failed (${res.status})` };
    if (data.class_title && !appState.joinedClassTitles.includes(data.class_title)) {
      appState.joinedClassTitles = [...appState.joinedClassTitles, data.class_title];
    }
    fetchJoinedClasses();
    return { ok: true, classTitle: data.class_title };
  } catch {
    return { ok: false, error: "Network error — please try again." };
  }
}

export async function selectSystemTrack(trackId: string, trackName?: string, gradeLevel?: string): Promise<boolean> {
  try {
    const res = await fetch("/api/studio/select-track", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({ track_id: trackId }),
    });
    if (!res.ok) return false;
    appState.selectedOnboardingTrackId = trackId;
    if (trackName) appState.onboardingCurriculum = trackName;
    if (gradeLevel) appState.studentGradeLevelId = gradeLevel;
    saveSession();
    // Persist the display name + grade on the account too, so a fresh login shows them.
    if (trackName || gradeLevel) {
      try {
        await fetch("/api/update-user", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "same-origin",
          body: JSON.stringify({
            email: appState.loginEmail,
            ...(trackName ? { academicTrack: trackName } : {}),
            ...(gradeLevel ? { gradeLevel } : {}),
          }),
        });
      } catch { /* select-track already persisted the enrollment */ }
    }
    return true;
  } catch {
  }
  return false;
}
export function setStudentTrackType(v: string) { appState.studentTrackType = v; }
export function setStudentProgramId(v: string) { appState.studentProgramId = v; }
export function setStudentGradeLevelId(v: string) { appState.studentGradeLevelId = v; }
export function setEnrollmentType(v: string) { appState.enrollmentType = v; }
export function setSchoolEnrollCode(v: string) { appState.schoolEnrollCode = v; }
export function setShowPaymentScreen(v: boolean) { appState.showPaymentScreen = v; }
export function setStudentBillingCycle(v: "monthly" | "yearly") { appState.studentBillingCycle = v; }
export function setSelectedLesson(v: Lesson | null) { appState.selectedLesson = v; }
export function setActiveQuiz(v: Quiz | null) { appState.activeQuiz = v; }
export function setQuizAnswers(v: number[]) { appState.quizAnswers = v; }
export function setShowQuizResult(v: boolean) { appState.showQuizResult = v; }
export function setIsExamProctoring(v: boolean) { appState.isExamProctoring = v; }
export function setActiveGame(v: string | null) { appState.activeGame = v; }
export function setTrinityGood(v: number) { appState.trinityGood = v; }
export function setTrinityMoney(v: number) { appState.trinityMoney = v; }
export function setTrinityFun(v: number) { appState.trinityFun = v; }
export function setRobotHip(v: number) { appState.robotHip = v; }
export function setRobotKnee(v: number) { appState.robotKnee = v; }
export function setRobotAnkle(v: number) { appState.robotAnkle = v; }
export function setIncBase(v: number) { appState.incBase = v; }
export function setIncRevenue(v: number) { appState.incRevenue = v; }
export function setIncCosts(v: number) { appState.incCosts = v; }
export function setIncKwhPrice(v: number) { appState.incKwhPrice = v; }
export function setChatInput(v: string) { appState.chatInput = v; }
export function setTasks(v: Task[]) { appState.tasks = v; }
export function setIsCreatingTask(v: boolean) { appState.isCreatingTask = v; }
export function setNewTaskTitle(v: string) { appState.newTaskTitle = v; }
export function setNewTaskDesc(v: string) { appState.newTaskDesc = v; }
export function setNewTaskCategory(v: string) { appState.newTaskCategory = v; }
export function setNewTaskReward(v: number) { appState.newTaskReward = v; }
export function setForumPosts(v: ForumPost[]) { appState.forumPosts = v; }
export function setNewPostTitle(v: string) { appState.newPostTitle = v; }
export function setNewPostContent(v: string) { appState.newPostContent = v; }
export function setNewPostCategory(v: string) { appState.newPostCategory = v; }
export function setContactName(v: string) { appState.contactName = v; }
export function setContactEmail(v: string) { appState.contactEmail = v; }
export function setContactMsg(v: string) { appState.contactMsg = v; }
export function setCalcStudents(v: number) { appState.calcStudents = v; }
export function setCalcBilling(v: "monthly" | "yearly") { appState.calcBilling = v; }
export function setExpandedFaq(v: number | null) { appState.expandedFaq = v; }
export function setShowDirectDonateModal(v: boolean) { appState.showDirectDonateModal = v; }
export function setSimulatedDonationAmount(v: string) { appState.simulatedDonationAmount = v; }

// Curriculum setters
export function setCurrentTrackId(v: string) { appState.currentTrackId = v; }
export function setCurrentTrackDisplayName(v: string) { appState.currentTrackDisplayName = v; }
export function setTrackLessons(v: Array<{ id: string; title: string; lesson_type: string; estimated_minutes: number; subject: string; grade_level: string; content_ref: string }>) { appState.trackLessons = v; }
export function setAvailableTracks(v: Array<{ id: string; country_code: string; grade_level: string; display_name: string }>) { appState.availableTracks = v; }
export function setCountryCatalog(v: Array<{ code: string; name: string }>) { appState.countryCatalog = v; }
export function setIsCurriculumLoading(v: boolean) { appState.isCurriculumLoading = v; }
export function setCurriculumError(v: string) { appState.curriculumError = v; }

// Gamification setters
export function setStreakDisplay(v: number) { appState.streakDisplay = v; }
export function setCurrentLevel(v: number) { appState.currentLevel = v; }
export function setTotalPoints(v: number) { appState.totalPoints = v; }
export function setBadgeCollection(v: string[]) { appState.badgeCollection = v; }
export function setRecentBadges(v: string[]) { appState.recentBadges = v; }
export function setSubjectProgress(v: Record<string, number>) { appState.subjectProgress = v; }

// Institution admin setters
export function setInstitutionId(v: string) { appState.institutionId = v; }
export function setInstitutionName(v: string) { appState.institutionName = v; }
export function setInstitutionStudents(v: Array<{ id: string; name: string; email: string; grade_level: string; points: number; streak_days: number; last_active: string }>) { appState.institutionStudents = v; }
export function setInstitutionTutors(v: Array<{ id: string; name: string; email: string; subjects: string[]; grade_levels: string[] }>) { appState.institutionTutors = v; }
export function setIsAdminLoading(v: boolean) { appState.isAdminLoading = v; }
export function setAdminError(v: string) { appState.adminError = v; }
export function setAssignedTutorId(v: string) { appState.assignedTutorId = v; }

// Community setters
export function setCommunityPosts(v: Array<{ id: string; author_name: string; author_level: number; title: string; content: string; likes: number; replies: number; category: string; created_at: string }>) { appState.communityPosts = v; }
export function setActiveCommunityTopic(v: string) { appState.activeCommunityTopic = v; }
export function setActiveCommunitySubject(v: string) { appState.activeCommunitySubject = v; }
export function setCommunityTopics(v: Array<{ id: string; label: string; subtopics: string[] }>) { appState.communityTopics = v; }
export function setIsSubmittingPost(v: boolean) { appState.isSubmittingPost = v; }
export function setPostSubmitError(v: string) { appState.postSubmitError = v; }

// Proctoring exam setters
export function setActiveExamAttemptId(v: string) { appState.activeExamAttemptId = v; }
export function setCurrentExamQuestions(v: Array<{ id: string; text: string; options: string[]; correctAnswerIndex: number }>) { appState.currentExamQuestions = v; }
export function setExamScore(v: number | null) { appState.examScore = v; }
export function setExamPassed(v: boolean) { appState.examPassed = v; }
export function setProctorExamStatus(v: "not_started" | "in_progress" | "flagged" | "verified" | "voided") { appState.proctorExamStatus = v; }
export function setProctorFlagsSummary(v: string[]) { appState.proctorFlagsSummary = v; }
export function setCameraStreamActive(v: boolean) { appState.cameraStreamActive = v; }

// ---------- Handlers ----------

export function updateProgressOnServer(updated: StudentProgress) {
  appState.progress = updated;
  fetch("/api/progress", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(updated)
  }).catch(err => console.warn("Failed to save progress:", err));
}

export function handleOnboardClassroom(e: Event) {
  e.preventDefault();
  if (appState.institutionCode.trim()) {
    appState.joinedClassroom = appState.institutionCode.toUpperCase();
    const updated = { ...appState.progress, points: appState.progress.points + 250 };
    updateProgressOnServer(updated);
  }
}

export function handleOnboardingNext() {
  appState.onboardingStep = Math.min(appState.onboardingStep + 1, 7);
}

export function handleOnboardingBack() {
  appState.onboardingStep = Math.max(appState.onboardingStep - 1, 1);
}

export function handleCompleteOnboarding() {
  appState.isOnboardingComplete = true;
  appState.isOnboarded = true;
  appState.onboardingStep = 1;
  appState.showPaymentScreen = false;
  clearOnboardingState();
  const updated = { ...appState.progress, points: appState.progress.points + 500 };
  updateProgressOnServer(updated);
}

// Apply a successful login response (user fields, session, navigation) shared by
// the normal login path and the wrong-door auto-recovery retry.
function applyLoginSuccess(data: any) {
  appState.studentName = data.user.name || appState.loginEmail.split("@")[0];
  appState.studentTrack = data.user.academicTrack || "";
  appState.isUserActivated = !!data.user.isActivated;
  appState.hasSystemPermission = !!data.user.hasSystemPermission;
  const serverType = data.user.type || "";
  let mappedRole: typeof appState.landingAuthRole = "water-student";
  if (serverType === "Water Student") mappedRole = "water-student";
  else if (serverType === "Independent Student") mappedRole = "independent-student";
  else if (serverType === "School Student") mappedRole = "school-student";
  else if (serverType === "Tutor") mappedRole = "tutor";
  else if (serverType === "Institution") mappedRole = "institution";
  appState.landingAuthRole = mappedRole;
  appState.isOnboarded = !!data.user.isOnboarded;
  if (data.user.isOnboarded) {
    appState.isOnboardingComplete = true;
    appState.isUserActivated = true;
  }
  if (data.user.country) appState.studentCountry = data.user.country;
  if (data.user.gradeLevel) appState.studentGradeLevelId = data.user.gradeLevel;
  if (data.user.enrollmentType) appState.enrollmentType = data.user.enrollmentType;
  if (data.user.academicTrack) appState.onboardingCurriculum = data.user.academicTrack;
  appState.isLoggedIn = true;
  saveSession();
  navigateTo("dashboard");
  if (!data.user.isActivated) {
    appState.landingAuthErrors = { form: "Account pending activation. Please complete onboarding to set up your account." };
  }
}

export async function handleLandingAuthSubmit(e: Event) {
  e.preventDefault();
  appState.tursoLoading = true;
  appState.tursoSuccessMsg = "";

  const emailErr = validateEmail(appState.loginEmail);
  const passwordErr = validatePassword(appState.loginAccessKey);
  const newErrors: typeof appState.landingAuthErrors = {};

  if (appState.landingAuthMode === "register") {
    if (appState.landingAuthRole === "institution") {
      if (!appState.regSchoolName.trim()) newErrors.schoolName = "School / institution name is required.";
      if (!appState.regRepName.trim()) newErrors.repName = "Representative name is required.";
    } else {
      if (!appState.regName.trim()) newErrors.name = "Full name is required.";
    }
  }
  if (emailErr) newErrors.email = emailErr;
  if (passwordErr) newErrors.password = passwordErr;

  if (Object.keys(newErrors).length > 0) {
    appState.landingAuthErrors = newErrors;
    appState.tursoLoading = false;
    return;
  }
  appState.landingAuthErrors = {};

  try {
    if (appState.landingAuthMode === "login") {
      const response = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: appState.loginEmail.trim(), passcode: appState.loginAccessKey, role: appState.landingAuthRole })
      });
      if (response.ok) {
        const data = await response.json();
        applyLoginSuccess(data);
      } else {
        const errData = await response.json().catch(() => ({}));
        const wrongDoor =
          (errData.error || "").includes("Please use the Institution login") ||
          (errData.error || "").includes("Please use the Student login");
        if (wrongDoor) {
          // Wrong-door auto-recovery: retry the same credentials through the other door
          // so the user isn't stuck fighting the role toggle.
          const otherRole = appState.landingAuthRole === "institution" ? "water-student" : "institution";
          const retry = await fetch("/api/login", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email: appState.loginEmail.trim(), passcode: appState.loginAccessKey, role: otherRole }),
          });
          if (retry.ok) {
            const rdata = await retry.json();
            applyLoginSuccess(rdata);
            return;
          }
        }
        appState.landingAuthErrors = { form: errData.error || "Invalid email or password. Please try again or switch to Register." };
      }
    } else {
      const isInstitution = appState.landingAuthRole === "institution";
      const nickname = appState.loginEmail.trim().split("@")[0];

      let typeStr = "Individual Student";
      let kindStr = "Homeschool Individual";
      let studentVol = 1;
      let billingStr = "Monthly";
      if (isInstitution) {
        typeStr = "Institution";
        kindStr = "Homeschool Co-Op";
        studentVol = Math.max(1, appState.regStudentVolume);
        billingStr = appState.regBillingCycle;
      } else if (appState.landingAuthRole === "water-student") {
        typeStr = "Water Student";
        kindStr = "Water School Homeschool";
      } else if (appState.landingAuthRole === "independent-student") {
        typeStr = "Independent Student";
        kindStr = "Self-Directed Learner";
      } else if (appState.landingAuthRole === "school-student") {
        typeStr = "School Student";
        kindStr = "School-Enrolled Learner";
      } else if (appState.landingAuthRole === "tutor") {
        typeStr = "Tutor";
        kindStr = "Tutor";
      }

      const regPayload: Record<string, any> = {
        type: typeStr,
        name: isInstitution ? appState.regSchoolName.trim() : appState.regName.trim(),
        email: appState.loginEmail.trim(),
        representative: isInstitution ? appState.regRepName.trim() : appState.regName.trim(),
        academicTrack: "Pick Later",
        studentVolume: studentVol,
        kindOfSchool: kindStr,
        billingCycle: billingStr,
        passcode: appState.loginAccessKey,
        affiliatedCode: appState.schoolEnrollCode || ""
      };
      const registerRes = await fetch("/api/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...regPayload, role: appState.landingAuthRole })
      });
      if (registerRes.ok) {
        const newRecord = await registerRes.json();
        if (newRecord.checkoutUrl) { window.location.href = newRecord.checkoutUrl; return; }
        appState.tursoRecords = [newRecord, ...appState.tursoRecords];
        appState.studentName = newRecord.name || appState.regName.trim() || nickname;
        appState.studentTrack = newRecord.academicTrack || "";
        appState.tursoSuccessMsg = "Account registered successfully! Signing you in...";
        appState.loginEmail = regPayload.email;
        appState.loginAccessKey = "";
        setTimeout(() => { appState.isLoggedIn = true; saveSession(); navigateTo("dashboard"); appState.tursoSuccessMsg = ""; }, 1400);
      } else {
        const errData = await registerRes.json().catch(() => ({}));
        appState.landingAuthErrors = { form: errData.error || "Registration failed. The email may already be registered." };
      }
    }
  } catch (err) {
    console.error("Auth failure", err);
    appState.landingAuthErrors = { form: "Network error. Please check your connection and try again." };
  } finally { appState.tursoLoading = false; }
}

export function handleOnboardingCountrySelect(code: string) {
  appState.studentCountry = code;
  const country = appState.countryCatalog.find(c => c.code === code);
  if (country) {
    appState.countryCatalog = [country];
  }
}

export function handleOnboardingGradeSelect(grade: string) {
  appState.studentGradeLevelId = grade;
}

export async function loadCurriculumForStudent() {
  if (!appState.isOnboarded) return;
  appState.isCurriculumLoading = true;
  appState.curriculumError = "";
  try {
    const res = await fetch("/api/curriculum/track", { credentials: "same-origin" });
    if (!res.ok) throw new Error(`Track load failed: ${res.status}`);
    const data = await res.json();
    appState.currentTrackId = data.track_id;
    appState.currentTrackDisplayName = data.display_name;
    appState.trackLessons = data.lessons || [];
  } catch (err: any) {
    appState.curriculumError = err.message || "Failed to load curriculum";
  } finally {
    appState.isCurriculumLoading = false;
  }
}

export async function handleStartExam(examId: string) {
  appState.isExamProctoring = true;
  appState.examTimer = 600;
  requestProctorCamera(appState.videoEl);
  try {
    const res = await fetch(`/api/exam/start`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({ exam_id: examId })
    });
    if (!res.ok) throw new Error("Failed to start exam");
    const data = await res.json();
    appState.activeExamAttemptId = data.attempt_id;
    appState.currentExamQuestions = data.questions || [];
    appState.examTimer = data.duration_seconds || 600;
    appState.proctorExamStatus = "in_progress";
  } catch (err: any) {
    appState.proctorLogs = [...appState.proctorLogs, `ERROR: ${err.message}`];
  }
}

export async function handleSubmitExam(answers: number[]) {
  if (!appState.activeExamAttemptId) return;
  try {
    const res = await fetch(`/api/exam/${appState.activeExamAttemptId}/submit`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({ answers })
    });
    if (!res.ok) throw new Error("Failed to submit exam");
    const data = await res.json();
    appState.examScore = data.score;
    appState.examPassed = data.passed;
    appState.proctorExamStatus = data.status;
    appState.proctorFlagsSummary = data.proctor_flags || [];
    if (appState.streamRef) appState.streamRef.getTracks().forEach(track => track.stop());
    appState.isExamProctoring = false;
    appState.cameraStreamActive = false;
    if (data.passed && appState.selectedLesson) {
      const completed = [...appState.progress.completedLessons];
      if (!completed.includes(appState.selectedLesson.id)) completed.push(appState.selectedLesson.id);
      const newPoints = appState.progress.points + (appState.activeQuiz?.pointsToAward || 100);
      const updated = { ...appState.progress, points: newPoints, completedLessons: completed };
      updateProgressOnServer(updated);
    }
  } catch (err: any) {
    appState.proctorLogs = [...appState.proctorLogs, `ERROR: ${err.message}`];
  }
}

export function loadLessonComponent(hash: string) {
  if (!hash) return;
  appState.isLessonLoading = true;
  appState.lessonError = "";
  appState.currentLessonHash = hash;
  fetch(`/api/lessons/component/${encodeURIComponent(hash)}`, {
    headers: { "Content-Type": "application/json" },
    credentials: "same-origin"
  })
    .then(res => res.json())
    .then(data => {
      if (data && data.id) {
        appState.currentLessonComponent = {
          hash: data.content_ref || hash,
          title: data.title,
          subject: data.subject,
          grade: data.grade_level,
          componentPath: `lessons/components/${hash}.svelte`,
          estimatedMinutes: data.estimated_minutes || 10,
          interactiveType: 'phaser-game'
        } as LessonComponent;
      } else {
        appState.lessonError = data?.error || "Lesson component not found";
      }
    })
    .catch(err => {
      appState.lessonError = err.message || "Failed to load lesson";
    })
    .finally(() => {
      appState.isLessonLoading = false;
    });
}

export async function fetchJoinedClasses() {
  try {
    const res = await fetch("/api/institution/curriculum/my-classes", { credentials: "same-origin" });
    if (!res.ok) return;
    const data = await res.json();
    appState.joinedClasses = data.classes || [];
  } catch { /* academy works without the list */ }
}

export async function fetchMyInstitution() {
  try {
    const res = await fetch("/api/my-institution", { credentials: "same-origin" });
    if (!res.ok) return;
    const data = await res.json();
    appState.myInstitution = data.institution || null;
  } catch { /* browsing works without it */ }
}

// Refresh the account from the database (type, grade, country, enrolled
// curriculum track) so Profile always shows saved values, not stale locals.
export async function refreshAccountFromServer(): Promise<boolean> {
  try {
    const res = await fetch("/api/session", { credentials: "same-origin" });
    if (!res.ok) return false;
    const data = await res.json();
    if (!data.authenticated || !data.user) return false;
    const u = data.user;
    const serverType = String(u.type || "");
    let mappedRole: typeof appState.landingAuthRole = "water-student";
    if (serverType === "Water Student") mappedRole = "water-student";
    else if (serverType === "Independent Student") mappedRole = "independent-student";
    else if (serverType === "School Student") mappedRole = "school-student";
    else if (serverType === "Tutor") mappedRole = "tutor";
    else if (serverType === "Institution") mappedRole = "institution";
    appState.landingAuthRole = mappedRole;
    appState.studentTrackType = mappedRole === "institution" ? appState.studentTrackType : mappedRole;
    appState.studentName = u.name || appState.studentName;
    if (u.country) appState.studentCountry = u.country;
    if (u.gradeLevel) appState.studentGradeLevelId = u.gradeLevel;
    if (u.academicTrack) appState.onboardingCurriculum = u.academicTrack;
    appState.isUserActivated = !!u.isActivated;
    appState.hasSystemPermission = !!u.hasSystemPermission;
    // Enrolled curriculum track (drives Academy + Profile).
    try {
      const trackRes = await fetch("/api/studio/my-track", { credentials: "same-origin" });
      if (trackRes.ok) {
        const trackData = await trackRes.json();
        if (trackData.track?.id) {
          appState.selectedOnboardingTrackId = trackData.track.id;
          appState.onboardingCurriculum = trackData.track.name || appState.onboardingCurriculum;
        }
      }
    } catch { /* track stays as-is */ }
    saveSession();
    return true;
  } catch {
    return false;
  }
}

export async function fetchBrowseTree() {
  appState.isBrowseTreeLoading = true;
  try {
    const res = await fetch("/api/studio/browse-tree", { credentials: "same-origin" });
    if (!res.ok) return;
    const data = await res.json();
    appState.browseTree = data.tracks || [];
  } catch { /* browsing works without it */ }
  finally { appState.isBrowseTreeLoading = false; }
}

export async function openStudioLesson(classId: string) {
  if (!classId) return;
  appState.isStudioLessonLoading = true;
  appState.studioLessonError = "";
  appState.activeStudioLesson = null;
  try {
    const res = await fetch(`/api/institution/curriculum/lessons/${encodeURIComponent(classId)}/view`, { credentials: "same-origin" });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `Could not open lesson (${res.status})`);
    appState.activeStudioLesson = data;
  } catch (err: any) {
    appState.studioLessonError = err.message || "Could not open lesson";
  } finally {
    appState.isStudioLessonLoading = false;
  }
}

export function closeStudioLesson() {
  appState.activeStudioLesson = null;
  appState.studioLessonError = "";
}

export function setCurrentLessonComponent(v: LessonComponent | null) { appState.currentLessonComponent = v; }
export function setCurrentLessonHash(v: string) { appState.currentLessonHash = v; }
export function setIsLessonLoading(v: boolean) { appState.isLessonLoading = v; }
export function setLessonError(v: string) { appState.lessonError = v; }

export function handleUpdateProfile(fields: { name?: string; gradeLevel?: string; country?: string; enrollmentType?: string }) {
  fetch("/api/update-user", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "same-origin",
    body: JSON.stringify({ email: appState.loginEmail, ...fields })
  }).then(res => res.json()).then(data => {
    if (data && data.success) {
      if (fields.name) appState.studentName = fields.name;
      if (fields.gradeLevel) appState.studentGradeLevelId = fields.gradeLevel;
      if (fields.country) appState.studentCountry = fields.country;
    }
  }).catch(err => {
    console.warn("Profile update failed:", err);
  });
}

export async function handleLoadInstitutionData() {
  if (appState.landingAuthRole !== "institution") return;
  appState.isAdminLoading = true;
  appState.adminError = "";
  try {
    const [rosterRes, tutorsRes, invitesRes, tutorInvitesRes] = await Promise.all([
      fetch("/api/institution/roster", { credentials: "same-origin" }),
      fetch("/api/institution/tutors", { credentials: "same-origin" }),
      fetch("/api/institution/roster/invites", { credentials: "same-origin" }),
      fetch("/api/institution/roster/tutor-invites", { credentials: "same-origin" }),
    ]);
    if (rosterRes.ok) {
      const data = await rosterRes.json();
      appState.institutionId = data.institution_id;
      appState.institutionName = data.institution_name || "";
      appState.institutionStudents = data.students || [];
      appState.institutionSeats = {
        paid: Number(data.paid_seats || 50),
        used: Number(data.used_seats || 0),
      };
    }
    if (invitesRes.ok) {
      const data = await invitesRes.json();
      appState.institutionInvites = data.invites || [];
    }
    if (tutorInvitesRes.ok) {
      const data = await tutorInvitesRes.json();
      appState.institutionTutorInvites = data.invites || [];
    }
    if (tutorsRes.ok) {
      const data = await tutorsRes.json();
      appState.institutionTutors = data.tutors || [];
    }
  } catch (err: any) {
    appState.adminError = err.message || "Failed to load institution data";
  } finally {
    appState.isAdminLoading = false;
  }
}

export async function handleLoadCommunityPosts(topicId: string, subject?: string) {
  appState.activeCommunityTopic = topicId;
  if (subject) appState.activeCommunitySubject = subject;
  try {
    const params = new URLSearchParams({ topic_id: topicId });
    if (subject) params.set("subject", subject);
    const res = await fetch(`/api/community/posts?${params.toString()}`, { credentials: "same-origin" });
    if (!res.ok) throw new Error("Failed to load posts");
    const data = await res.json();
    appState.communityPosts = data.posts || [];
  } catch (err: any) {
    appState.postSubmitError = err.message || "Failed to load community posts";
  }
}

export async function handleCreateCommunityPost(title: string, content: string, category: string, gradeLevel: string) {
  appState.isSubmittingPost = true;
  appState.postSubmitError = "";
  appState.postSubmitNotice = "";
  try {
    const res = await fetch("/api/community/posts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({ title, content, category, grade_level: gradeLevel })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || data.details || "Failed to create post");
    if (data.status === "pending") {
      // Young-grade posts await review — they are saved but hidden until approved.
      appState.postSubmitNotice = "Saved! Your thread is pending review and will appear once approved.";
    } else {
      const newPost = { id: data.id, author_name: appState.studentName, author_level: appState.progress.level, title, content, likes: 0, replies: 0, category, created_at: new Date().toISOString() };
      appState.communityPosts = [newPost, ...appState.communityPosts];
      appState.postSubmitNotice = "";
    }
    appState.newPostTitle = "";
    appState.newPostContent = "";
  } catch (err: any) {
    appState.postSubmitError = err.message || "Failed to create post";
  } finally {
    appState.isSubmittingPost = false;
  }
}

export async function handleLikeCommunityPost(postId: string) {
  try {
    const res = await fetch(`/api/community/posts/${postId}/like`, {
      method: "POST",
      credentials: "same-origin"
    });
    if (!res.ok) return;
    const data = await res.json();
    appState.communityPosts = appState.communityPosts.map(p => p.id === postId ? { ...p, likes: data.likes } : p);
    if (appState.activeThread?.id === postId) {
      appState.activeThread = { ...appState.activeThread, likes: data.likes };
    }
  } catch {}
}

export async function handleLikeReply(replyId: string) {
  try {
    const res = await fetch(`/api/community/replies/${replyId}/like`, {
      method: "POST",
      credentials: "same-origin"
    });
    if (!res.ok) return;
    const data = await res.json();
    appState.threadReplies = appState.threadReplies.map(r => r.id === replyId ? { ...r, likes: data.likes } : r);
  } catch {}
}

// ─── Direct messages ───
export async function fetchDMConversations() {
  try {
    const res = await fetch("/api/messages/conversations", { credentials: "same-origin" });
    if (!res.ok) return;
    const data = await res.json();
    appState.dmConversations = data.conversations || [];
    appState.dmUnreadTotal = data.total_unread || 0;
  } catch { /* messages tab shows the empty state */ }
}

export async function fetchDMDirectory() {
  try {
    const res = await fetch("/api/messages/directory", { credentials: "same-origin" });
    if (!res.ok) return;
    const data = await res.json();
    appState.dmDirectory = data.users || [];
  } catch { /* compose box stays empty */ }
}

export async function openDMConversation(userId: string, name?: string) {
  appState.dmOther = { id: userId, name: name || "", type: "" };
  appState.dmMessages = [];
  appState.isDMsLoading = true;
  appState.dmError = "";
  try {
    const res = await fetch(`/api/messages/with/${encodeURIComponent(userId)}`, { credentials: "same-origin" });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "Failed to open conversation");
    appState.dmOther = data.other;
    appState.dmMessages = data.messages || [];
    // Reading clears this thread's unread — refresh the list counts.
    fetchDMConversations();
  } catch (err: any) {
    appState.dmError = err.message || "Failed to open conversation";
  } finally {
    appState.isDMsLoading = false;
  }
}

export function closeDMConversation() {
  appState.dmOther = null;
  appState.dmMessages = [];
  appState.dmRecipientId = "";
}

export async function handleSendDM() {
  const content = appState.dmInput.trim();
  const recipientId = appState.dmOther?.id || appState.dmRecipientId;
  if (!content || !recipientId || appState.isDMSending) return;
  appState.isDMSending = true;
  appState.dmError = "";
  try {
    const res = await fetch("/api/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({ recipient_id: recipientId, content }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "Failed to send message");
    appState.dmMessages = [...appState.dmMessages, data];
    appState.dmInput = "";
    appState.dmRecipientId = "";
    fetchDMConversations();
  } catch (err: any) {
    appState.dmError = err.message || "Failed to send message";
  } finally {
    appState.isDMSending = false;
  }
}

export async function handleDeleteCommunityPost(postId: string): Promise<boolean> {
  try {
    const res = await fetch(`/api/community/posts/${postId}`, {
      method: "DELETE",
      credentials: "same-origin"
    });
    if (!res.ok) return false;
    appState.communityPosts = appState.communityPosts.filter(p => p.id !== postId);
    if (appState.activeThread?.id === postId) {
      appState.activeThread = null;
      appState.threadReplies = [];
    }
    return true;
  } catch {
    return false;
  }
}

// ─── Thread view: open a thread + its replies ───
export async function openThread(post: { id: string; author_name: string; author_level: number; title: string; content: string; likes: number; replies: number; category: string; created_at: string }) {
  appState.activeThread = post;
  appState.threadReplies = [];
  appState.isThreadLoading = true;
  appState.threadError = "";
  try {
    const res = await fetch(`/api/community/posts/${post.id}/replies`, { credentials: "same-origin" });
    if (!res.ok) throw new Error("Failed to load replies");
    const data = await res.json();
    appState.threadReplies = data.replies || [];
  } catch (err: any) {
    appState.threadError = err.message || "Failed to load replies";
  } finally {
    appState.isThreadLoading = false;
  }
}

export function closeThread() {
  appState.activeThread = null;
  appState.threadReplies = [];
  appState.threadError = "";
  appState.newReplyContent = "";
}

export async function handleSendReply() {
  const post = appState.activeThread;
  const content = appState.newReplyContent.trim();
  if (!post || !content || appState.isSendingReply) return;
  appState.isSendingReply = true;
  try {
    const res = await fetch(`/api/community/posts/${post.id}/replies`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({ content }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || data.details || "Failed to post reply");
    appState.threadReplies = [...appState.threadReplies, data];
    appState.newReplyContent = "";
    appState.communityPosts = appState.communityPosts.map(p =>
      p.id === post.id ? { ...p, replies: p.replies + 1 } : p
    );
    appState.activeThread = { ...post, replies: post.replies + 1 };
  } catch (err: any) {
    appState.threadError = err.message || "Failed to post reply";
  } finally {
    appState.isSendingReply = false;
  }
}

export async function handleDeleteReply(replyId: string): Promise<boolean> {
  try {
    const res = await fetch(`/api/community/replies/${replyId}`, {
      method: "DELETE",
      credentials: "same-origin"
    });
    if (!res.ok) return false;
    appState.threadReplies = appState.threadReplies.filter(r => r.id !== replyId);
    if (appState.activeThread) {
      const n = Math.max((appState.activeThread.replies || 1) - 1, 0);
      appState.activeThread = { ...appState.activeThread, replies: n };
      appState.communityPosts = appState.communityPosts.map(p =>
        p.id === appState.activeThread!.id ? { ...p, replies: n } : p
      );
    }
    return true;
  } catch {
    return false;
  }
}

export async function fetchTutorClasses() {
  if (appState.landingAuthRole !== "tutor") return;
  appState.isTutorClassesLoading = true;
  try {
    const res = await fetch("/api/tutor/classes", { credentials: "same-origin" });
    if (!res.ok) return;
    const data = await res.json();
    appState.tutorClasses = data.classes || [];
  } catch { /* academy works without the list */ }
  finally { appState.isTutorClassesLoading = false; }
}

export async function fetchStudentsSummary() {
  if (appState.landingAuthRole !== "institution") return;
  appState.isStudentsSummaryLoading = true;
  try {
    const res = await fetch("/api/institution/roster/students-summary", { credentials: "same-origin" });
    if (!res.ok) return;
    const data = await res.json();
    appState.studentsSummary = data.tracks || [];
  } catch { /* screen shows the empty state */ }
  finally { appState.isStudentsSummaryLoading = false; }
}

export async function fetchSeatPurchases() {
  if (appState.landingAuthRole !== "institution") return;
  appState.isSeatPurchasesLoading = true;
  try {
    const res = await fetch("/api/seats/purchases", { credentials: "same-origin" });
    if (!res.ok) return;
    const data = await res.json();
    appState.seatPurchases = data.purchases || [];
    appState.seatMonth = data.month || { year: 0, month: 0, spots: 0, amount_cents: 0 };
  } catch { /* payments tab shows the empty state */ }
  finally { appState.isSeatPurchasesLoading = false; }
}

export function computeStreak(lastActiveDate: string): number {
  const today = new Date();
  const last = new Date(lastActiveDate + "T00:00:00");
  const diffMs = today.getTime() - last.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  const currentStreak = appState.progress.streakDays;
  if (diffDays === 0) return currentStreak;
  if (diffDays === 1) return currentStreak;
  const hours = (today.getHours() + today.getMinutes() / 60);
  if (diffDays === 2 && hours < 0.5) return currentStreak;
  return 1;
}

export function requestProctorCamera(videoEl?: HTMLVideoElement | null) {
  appState.proctorLogs = ["Proctor VLM System: Active proctoring initial validation.", "Syncing with Water Classroom Global Registrar database...", "Capturing face landmark arrays..."];
  navigator.mediaDevices?.getUserMedia({ video: { width: 320, height: 240 } })
    .then(stream => {
      appState.cameraPermissionGranted = true;
      appState.streamRef = stream;
      appState.cameraStreamActive = true;
      if (videoEl) videoEl.srcObject = stream;
      appState.proctorLogs = [...appState.proctorLogs, "SUCCESS: Hardware camera stream initialized."];
    })
    .catch(() => {
      appState.cameraPermissionGranted = false;
      appState.cameraStreamActive = false;
      appState.proctorLogs = [...appState.proctorLogs, "WARNING: No active camera hardware granted or available."];
    });
}

export function startVerifiedProctorExam() {
  appState.isExamProctoring = true;
  appState.examTimer = 600;
  requestProctorCamera(appState.videoEl);
}

export function stopVerifiedProctorExam(successScore: number, totalQuest: number) {
  if (appState.streamRef) appState.streamRef.getTracks().forEach(track => track.stop());
  appState.isExamProctoring = false;
  if (appState.selectedLesson) {
    const examHash = `WX-${Math.floor(Math.random() * 1000000).toString(16).toUpperCase()}-${Math.floor(Math.random() * 9000).toString()}`;
    appState.verifiedExamsList = [{
      id: `cert-${Date.now()}`,
      lessonTitle: appState.selectedLesson.title,
      hash: examHash,
      score: `${successScore} / ${totalQuest}`,
      timestamp: new Date().toLocaleDateString()
    }, ...appState.verifiedExamsList];
  }
}

export function handleQuizSubmit() {
  if (!appState.activeQuiz) return;
  let score = 0;
  appState.activeQuiz.questions.forEach((q, idx) => {
    if (appState.quizAnswers[idx] === q.correctAnswerIndex) score++;
  });
  appState.quizScore = score;
  appState.showQuizResult = true;
  if (appState.isExamProctoring) stopVerifiedProctorExam(score, appState.activeQuiz.questions.length);

  const participationPoints = 10;
  const masteryBonus = score === appState.activeQuiz.questions.length ? 25 : 0;
  const newPoints = appState.progress.points + participationPoints + masteryBonus;
  const completed = [...appState.progress.completedLessons];
  if (score > 0 && !completed.includes(appState.activeQuiz.lessonId)) completed.push(appState.activeQuiz.lessonId);
  const currentBadges = [...appState.progress.unlockedBadges];
  let unlockedNew = false;
  let badgeKey = "pioneer";
  if (appState.activeQuiz.id.includes("creed") && !currentBadges.includes("pioneer")) { badgeKey = "pioneer"; unlockedNew = true; }
  else if (appState.activeQuiz.id.includes("scitech") && !currentBadges.includes("engineer")) { badgeKey = "engineer"; unlockedNew = true; }
  else if (appState.activeQuiz.id.includes("business") && !currentBadges.includes("builder")) { badgeKey = "builder"; unlockedNew = true; }
  else if (appState.activeQuiz.id.includes("dynamics") && !currentBadges.includes("philosopher")) { badgeKey = "philosopher"; unlockedNew = true; }
  if (unlockedNew) currentBadges.push(badgeKey);
  const updatedProgress = { ...appState.progress, points: newPoints, completedLessons: completed, unlockedBadges: currentBadges, level: Math.floor(newPoints / 1000) + 1 };
  updateProgressOnServer(updatedProgress);
  if (appState.selectedLesson) {
    const subject = appState.selectedLesson.curriculum || 'General';
    const currentSubjectProgress = appState.subjectProgress[subject] || 0;
    const newSubjectProgress = Math.min(1, currentSubjectProgress + (score === appState.activeQuiz.questions.length ? 0.1 : 0.03));
    appState.subjectProgress = { ...appState.subjectProgress, [subject]: newSubjectProgress };
  }
}

export async function handleSendMessage(textToSend?: string) {
  const rawVal = textToSend || appState.chatInput;
  if (!rawVal.trim()) return;
  const studentMessage: ChatMessage = {
    id: `std-${Date.now()}`,
    sender: "student", text: rawVal,
    timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  };
  appState.chatMessages = [...appState.chatMessages, studentMessage];
  if (!textToSend) appState.chatInput = "";
  appState.isTutorTyping = true;
  try {
    const response = await fetch("/api/ai/tutor", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        messages: [studentMessage],
        selectedLessonContext: appState.selectedLesson
          ? `${appState.selectedLesson.title}: ${appState.selectedLesson.description} (Subject: ${appState.selectedLesson.curriculum || 'General'}, Grade: ${appState.studentGradeLevelId || 'All'})`
          : "General Curriculum Track"
      })
    });
    const data = await response.json();
    appState.chatMessages = [...appState.chatMessages, {
      id: `tut-${Date.now()}`, sender: "tutor", text: data.text || "I apologize. Could we reformulate that query under first principles?",
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    }];
  } catch {
    appState.chatMessages = [...appState.chatMessages, {
      id: `tut-${Date.now()}`, sender: "tutor",
      text: "### Socratic Response Refined ⚙️\n\nI apologize. Let's redirect our intellectual inquiry down key tracks:\n1. **Quantification**: What metrics are you tracking specifically?\n2. **Synthesis**: How does this align with the Trinity Test?\n\n*Configure your authentic Gemini API key in AI Studio Secrets to unlock the adaptive tutoring model.*",
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    }];
  } finally { appState.isTutorTyping = false; }
}

export function handleCreateTask(e: Event) {
  e.preventDefault();
  if (!appState.newTaskTitle.trim() || !appState.newTaskDesc.trim()) return;
  fetch("/api/tasks", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title: appState.newTaskTitle, description: appState.newTaskDesc, category: appState.newTaskCategory, rewardPoints: appState.newTaskReward, createdBy: "Private Builder" })
  }).then(res => res.json()).then(data => {
    if (data && data.id) { appState.tasks = [data, ...appState.tasks]; appState.isCreatingTask = false; appState.newTaskTitle = ""; appState.newTaskDesc = ""; }
  }).catch(() => {
    appState.tasks = [{ id: `task-local-${Date.now()}`, title: appState.newTaskTitle, description: appState.newTaskDesc, category: appState.newTaskCategory, rewardPoints: appState.newTaskReward, status: "Open", assignee: null, createdBy: "Student Self-Builder", backersCount: 1 }, ...appState.tasks];
    appState.isCreatingTask = false; appState.newTaskTitle = ""; appState.newTaskDesc = "";
  });
}

export function handleJoinTask(id: string) {
  appState.tasks = appState.tasks.map(t => {
    if (t.id === id) {
      const isAssigned = t.status === "In Progress";
      return { ...t, status: isAssigned ? "Completed" : "In Progress", assignee: isAssigned ? t.assignee : "Student Builder", backersCount: t.backersCount + (isAssigned ? 0 : 1) };
    }
    return t;
  });
  updateProgressOnServer({ ...appState.progress, points: appState.progress.points + 300 });
}

export function handleAddForumPost(e: Event) {
  e.preventDefault();
  if (!appState.newPostTitle.trim() || !appState.newPostContent.trim()) return;
  appState.forumPosts = [{
    id: `post-${Date.now()}`, author: appState.studentName || appState.loginEmail.split("@")[0], userLevel: appState.progress.level,
    title: appState.newPostTitle, content: appState.newPostContent, likes: 1, replies: 0, category: appState.newPostCategory
  }, ...appState.forumPosts];
  appState.newPostTitle = ""; appState.newPostContent = "";
  updateProgressOnServer({ ...appState.progress, points: appState.progress.points + 100 });
}

export async function executeSendMessage(e: Event) {
  e.preventDefault();
  if (!appState.contactName || !appState.contactEmail || !appState.contactMsg) return;
  appState.isSendingContact = true;
  appState.contactErrorMsg = "";
  appState.sendingStatus = "Securing encrypted channel...";
  const chars = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  let pCode = 'STELLAR-PRP-';
  for (let i = 0; i < 12; i++) pCode += chars[Math.floor(Math.random() * chars.length)];
  try {
    await new Promise(resolve => setTimeout(resolve, 800));
    appState.sendingStatus = "Encrypting pitch parameters...";
    await new Promise(resolve => setTimeout(resolve, 600));
    appState.sendingStatus = "Broadcasting through StaticForms Gateway...";
    const formattedMessage = `STELLARIUM SUITE SECURE TRANS-PITCH [${pCode}]\n========================================\n- Name: ${appState.contactName}\n- Email: ${appState.contactEmail}\n- Expected Students: ${appState.calcStudents}\n- Billing Cycle: ${appState.calcBilling}\n- Est. Cost: $${calculateInstitutionalBulkCost().toLocaleString()} USD\n\nMessage:\n----------------------------------------\n${appState.contactMsg}\n========================================`;
    const response = await fetch("https://api.staticforms.dev/submit", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ apiKey: "sf_0491b9b3fbb2f4f489b6a319", name: appState.contactName, email: appState.contactEmail, message: formattedMessage })
    });
    const data = await response.json();
    if (data.success) {
      appState.contactConfirmed = true;
      setTimeout(() => { appState.contactConfirmed = false; appState.contactName = ""; appState.contactEmail = ""; appState.contactMsg = ""; }, 5000);
    } else appState.contactErrorMsg = data.message || 'Transmitter gateway server rejected the bundle.';
  } catch {
    appState.contactErrorMsg = 'Direct transmission failed. Use the "Send Direct Email Now" code fallback.';
  } finally { appState.isSendingContact = false; }
}

export function calculateInstitutionalBulkCost(): number {
  const baseRatePerStudent = appState.calcBilling === "yearly" ? 144 : 12;
  return Math.floor(appState.calcStudents * baseRatePerStudent);
}

export function calculatedRewardMultiplier(): number {
  const costFactor = appState.incRevenue / Math.max(appState.incCosts, 1000);
  const kwhFactor = 1 / Math.max(appState.incKwhPrice, 0.05);
  return parseFloat((costFactor * (kwhFactor * 0.1)).toFixed(2));
}

export function handleSimulatedSupport(e: Event) {
  e.preventDefault();
  appState.donationSuccess = true;
  updateProgressOnServer({ ...appState.progress, points: appState.progress.points + 500 });
  setTimeout(() => { appState.donationSuccess = false; appState.showDirectDonateModal = false; }, 4000);
}

// ---------- Effects ----------

$effect.root(() => {
  let initialLoad = true;
  $effect(() => {
    if (appState.isLoggedIn && !initialLoad) {
      navigateTo("dashboard");
    }
    initialLoad = false;
  });

  $effect(() => {
    const searchParams = new URLSearchParams(window.location.search);
    if (searchParams.get("payment_success")) {
      const email = searchParams.get("email");

      fetch("/api/activate-user", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email })
      }).catch(err => console.warn("Failed to activate user:", err));

      alert(`Payment successful! Your registration is complete. Check your email (${email}) for login details or sign in directly.`);
      appState.isLoggedIn = true;
      appState.isUserActivated = true;
      appState.isOnboarded = true;
      appState.isOnboardingComplete = true;
      appState.showPaymentScreen = false;
      navigateTo("dashboard");
      window.history.replaceState({}, document.title, window.location.pathname);
    } else if (searchParams.get("payment_cancel")) {
      alert("Payment was cancelled or failed. Please try again.");
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  });

  // Check session cookie on page load
  $effect(() => {
    const checkSession = async () => {
      if (appState.isLoggedIn) return;
      try {
        const res = await fetch("/api/session");
        const data = await res.json();
        if (data.authenticated && data.user) {
        appState.studentName = data.user.name || "";
        appState.studentTrack = data.user.academicTrack || "";
        appState.isUserActivated = !!data.user.isActivated;
        appState.hasSystemPermission = !!data.user.hasSystemPermission;
        const serverType = data.user.type || "";
        if (serverType === "Water Student") appState.landingAuthRole = "water-student";
        else if (serverType === "Institution") appState.landingAuthRole = "institution";
        else if (serverType === "Independent Student") appState.landingAuthRole = "independent-student";
        else if (serverType === "School Student") appState.landingAuthRole = "school-student";
          if (data.user.isOnboarded) {
            appState.isOnboarded = true;
            appState.isOnboardingComplete = true;
          }
          if (data.user.country) appState.studentCountry = data.user.country;
          if (data.user.gradeLevel) appState.studentGradeLevelId = data.user.gradeLevel;
          if (data.user.enrollmentType) appState.enrollmentType = data.user.enrollmentType;
          if (data.user.academicTrack) appState.onboardingCurriculum = data.user.academicTrack;
          if (data.user.email) appState.loginEmail = data.user.email;
          appState.isLoggedIn = true;
        }
      } catch {}
    };
    checkSession();
  });

  $effect(() => {
    const loadInitialData = async () => {
      try {
        const [progressRes, tasksRes, recordsRes] = await Promise.all([
          fetch("/api/progress"),
          fetch("/api/tasks"),
          fetch("/api/records"),
        ]);
        if (progressRes.ok) {
          const data = await progressRes.json();
          if (data && typeof data.points === "number") {
            appState.progress = data;
            appState.streakDisplay = computeStreak(data.lastActiveDate || new Date().toISOString().split("T")[0]);
            appState.currentLevel = data.level || 1;
            appState.totalPoints = data.points || 0;
            appState.badgeCollection = data.unlockedBadges || [];
            appState.recentBadges = (data.unlockedBadges || []).slice(-3);
          }
        }
        if (tasksRes.ok) {
          const data = await tasksRes.json();
          if (Array.isArray(data)) appState.tasks = data;
        }
        if (recordsRes.ok) {
          const data = await recordsRes.json();
          if (Array.isArray(data)) appState.tursoRecords = data;
        }
      } catch (err) {
        console.warn("Failed to load initial data:", err);
      }
    };
    loadInitialData();
  });

  $effect(() => {
    const streak = appState.progress.streakDays;
    const badges = [...appState.progress.unlockedBadges];
    let changed = false;
    if (streak >= 30 && !badges.includes("streak-30")) { badges.push("streak-30"); changed = true; }
    else if (streak >= 7 && !badges.includes("streak-7")) { badges.push("streak-7"); changed = true; }
    if (changed) {
      updateProgressOnServer({ ...appState.progress, unlockedBadges: badges });
    }
  });

  $effect(() => {
    if (appState.isOnboarded && appState.studentCountry && appState.countryCatalog.length === 0) {
      import("./countryCatalog.ts").then(m => {
        appState.countryCatalog = m.COUNTRY_CATALOG;
      }).catch(() => {});
    }
  });

  $effect(() => {
    if (appState.isLoggedIn && appState.isOnboarded && appState.currentTrackId === "") {
      loadCurriculumForStudent();
    }
  });

  $effect(() => {
    appState.chatBottomEl?.scrollIntoView({ behavior: "smooth" });
  });

  $effect(() => {
    let interval: ReturnType<typeof setInterval> | undefined;
    if (appState.isExamProctoring && appState.examTimer > 0) {
      interval = setInterval(() => {
        appState.examTimer = appState.examTimer - 1;
        if (Math.random() > 0.8) {
          const checkTypes = [
            "Proctor VLM: Facial alignment within 99.1% boundary.",
            "Proctor Eye Tracker: Attention vector confirmed on window.",
            "Screen Monitor: No duplicate monitors detected.",
            "Proctor Audio Decibel: Noise constraints satisfied (12dB average).",
            "Proctor State: Integrity verified."
          ];
          const logMsg = checkTypes[Math.floor(Math.random() * checkTypes.length)];
          appState.proctorLogs = [...appState.proctorLogs.slice(-4), logMsg];
        }
      }, 1000);
    }
    return () => clearInterval(interval);
  });

  $effect(() => {
    if (appState.activeGame === "trinity") {
      if (appState.trinityGood === 100 && appState.trinityMoney === 100 && appState.trinityFun === 100) {
        appState.trinityWinner = true;
        updateProgressOnServer({ ...appState.progress, points: appState.progress.points + 150 });
      } else appState.trinityWinner = false;
    }
  });

  $effect(() => {
    if (appState.activeGame === "robotics") {
      const hipOK = appState.robotHip >= 60 && appState.robotHip <= 70;
      const kneeOK = appState.robotKnee >= 92 && appState.robotKnee <= 98;
      const ankleOK = appState.robotAnkle >= 82 && appState.robotAnkle <= 88;
      if (hipOK && kneeOK && ankleOK) {
        appState.robotBalanced = true;
        updateProgressOnServer({ ...appState.progress, points: appState.progress.points + 200 });
      } else appState.robotBalanced = false;
    }
  });

  $effect(() => {
    saveOnboardingState({
      onboardingStep: appState.onboardingStep,
      isOnboardingComplete: appState.isOnboardingComplete,
      studentCountry: appState.studentCountry,
      studentTrackType: appState.studentTrackType,
      studentProgramId: appState.studentProgramId,
      studentGradeLevelId: appState.studentGradeLevelId,
      enrollmentType: appState.enrollmentType,
      schoolEnrollCode: appState.schoolEnrollCode,
      showPaymentScreen: appState.showPaymentScreen,
      isOnboarded: appState.isOnboarded,
      onboardingCurriculum: appState.onboardingCurriculum,
      landingAuthRole: appState.landingAuthRole,
      studentBillingCycle: appState.studentBillingCycle,
    });
  });
});
