import { createClient } from "@libsql/client";
import fs from "fs";
import path from "path";

export type K12CurriculumLesson = {
  hash: string;
  title: string;
  grade: string;
  subject: string;
  interactiveType: "phaser-game" | "quiz" | "scenario";
  estimatedMinutes: number;
  storyHook?: string;
};

export type K12CurriculumFile = {
  subject: string;
  description: string;
  lessons: K12CurriculumLesson[];
};

// Sentinel owner of canonical Water tracks (no login). System-permission
// users manage these rows in the global Studio alongside their own.
export const WATER_SYSTEM_OWNER = "water-system";

const CURRICULUM_ROOT = path.join(process.cwd(), "lessons", "curriculums");
const CURRICULUM_FILES = [
  "k12-mathematics.json",
  "k12-science.json",
  "k12-history.json",
  "k12-geography.json",
  "k12-leadership.json",
];

export function loadK12CurriculumFiles(): K12CurriculumFile[] {
  return CURRICULUM_FILES
    .map(fileName => {
      const filePath = path.join(CURRICULUM_ROOT, fileName);
      if (!fs.existsSync(filePath)) return null;
      const parsed = JSON.parse(fs.readFileSync(filePath, "utf8")) as K12CurriculumFile;
      return parsed;
    })
    .filter((file): file is K12CurriculumFile => Boolean(file));
}

// ─── Turso Client (lazy init) ───
let client: ReturnType<typeof createClient> | null = null;

export function getDb() {
  if (!client) {
    const url = process.env.TURSO_DATABASE_URL;
    const authToken = process.env.TURSO_AUTH_TOKEN;
    if (!url || !authToken) {
      throw new Error("TURSO_DATABASE_URL and TURSO_AUTH_TOKEN must be set as environment variables");
    }
    client = createClient({ url, authToken });
  }
  return client;
}

async function seedK12CurriculumMetadata() {
  const db = getDb();
  const curriculumFiles = loadK12CurriculumFiles();
  const now = new Date().toISOString();
  for (const curriculum of curriculumFiles) {
    const subjectKey = curriculum.subject.toLowerCase().replace(/[^a-z0-9]+/g, "-");
    const byGrade = new Map<string, K12CurriculumLesson[]>();
    for (const lesson of curriculum.lessons) {
      await db.execute({
        sql: `INSERT INTO lessons (id, external_id, title, description, subject, grade_level, lesson_type, estimated_minutes, content_ref, quiz_ref, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET title=excluded.title, description=excluded.description, subject=excluded.subject, grade_level=excluded.grade_level, lesson_type=excluded.lesson_type, estimated_minutes=excluded.estimated_minutes, content_ref=excluded.content_ref, quiz_ref=excluded.quiz_ref`,
        args: [
          lesson.hash,
          lesson.hash,
          lesson.title,
          lesson.storyHook || curriculum.description,
          lesson.subject,
          lesson.grade,
          "game",
          lesson.estimatedMinutes,
          lesson.hash,
          "",
          now,
        ],
      });
      const gradeLessons = byGrade.get(lesson.grade) || [];
      gradeLessons.push(lesson);
      byGrade.set(lesson.grade, gradeLessons);
    }
    for (const [gradeLevel, lessons] of byGrade.entries()) {
      const lessonIds = lessons.map(lesson => lesson.hash);
      await db.execute({
        sql: `INSERT INTO curriculum_tracks (id, country_code, country_name, grade_level, track_type, display_name, lesson_ids, is_default, created_at)
          VALUES (?, 'US', 'United States', ?, 'country_standard', ?, ?, 1, ?)
          ON CONFLICT(id) DO UPDATE SET country_code=excluded.country_code, country_name=excluded.country_name, grade_level=excluded.grade_level, track_type=excluded.track_type, display_name=excluded.display_name, lesson_ids=excluded.lesson_ids, is_default=excluded.is_default`,
        args: [
          `track-US-${gradeLevel}-${subjectKey}`,
          gradeLevel,
          `US K-12 ${curriculum.subject} — Grade ${gradeLevel}`,
          JSON.stringify(lessonIds),
          now,
        ],
      });
    }
  }
}

export async function initDB() {
  const db = getDb();
  await db.execute(`
    CREATE TABLE IF NOT EXISTS turso_records (
      id TEXT PRIMARY KEY,
      type TEXT,
      name TEXT,
      representative TEXT,
      academicTrack TEXT,
      studentVolume INTEGER,
      kindOfSchool TEXT,
      billingCycle TEXT,
      calculatedPrice TEXT,
      registeredAt TEXT,
      dbStatus TEXT,
      passcode TEXT,
      affiliatedCode TEXT,
      isActivated INTEGER DEFAULT 0,
      paid_seats INTEGER DEFAULT 0
    )
  `);
  // Add missing columns if table existed without them
  try {
    const cols = await db.execute("PRAGMA table_info(turso_records)");
    const colNames = cols.rows.map((r: any) => r.name);
    if (!colNames.includes("email")) await db.execute("ALTER TABLE turso_records ADD COLUMN email TEXT");
    if (!colNames.includes("passcode")) await db.execute("ALTER TABLE turso_records ADD COLUMN passcode TEXT");
    if (!colNames.includes("affiliatedCode")) await db.execute("ALTER TABLE turso_records ADD COLUMN affiliatedCode TEXT");
    if (!colNames.includes("isActivated")) await db.execute("ALTER TABLE turso_records ADD COLUMN isActivated INTEGER DEFAULT 0");
    if (!colNames.includes("country")) await db.execute("ALTER TABLE turso_records ADD COLUMN country TEXT DEFAULT ''");
    if (!colNames.includes("gradeLevel")) await db.execute("ALTER TABLE turso_records ADD COLUMN gradeLevel TEXT DEFAULT ''");
    if (!colNames.includes("enrollmentType")) await db.execute("ALTER TABLE turso_records ADD COLUMN enrollmentType TEXT DEFAULT ''");
    if (!colNames.includes("isOnboarded")) await db.execute("ALTER TABLE turso_records ADD COLUMN isOnboarded INTEGER DEFAULT 0");
    if (!colNames.includes("assignedTutorId")) await db.execute("ALTER TABLE turso_records ADD COLUMN assignedTutorId TEXT DEFAULT ''");
    if (!colNames.includes("adminTrackId")) await db.execute("ALTER TABLE turso_records ADD COLUMN adminTrackId TEXT DEFAULT ''");
    if (!colNames.includes("hasSystemPermission")) await db.execute("ALTER TABLE turso_records ADD COLUMN hasSystemPermission INTEGER DEFAULT 0");
    // Paid student spots (seat-based billing). Backfill legacy institutions from studentVolume.
    if (!colNames.includes("paid_seats")) await db.execute("ALTER TABLE turso_records ADD COLUMN paid_seats INTEGER DEFAULT 0");
    try {
      await db.execute("UPDATE turso_records SET paid_seats = studentVolume WHERE type = 'Institution' AND (paid_seats IS NULL OR paid_seats = 0)");
    } catch { /* backfill is best-effort */ }
    // Class join codes on admin_classes (institution classes get a code on creation)
    const clsCols = await db.execute("PRAGMA table_info(admin_classes)");
    const clsColNames = clsCols.rows.map((r: any) => r.name);
    if (!clsColNames.includes("class_code")) await db.execute("ALTER TABLE admin_classes ADD COLUMN class_code TEXT DEFAULT ''");
    if (!clsColNames.includes("quiz_markdown")) await db.execute("ALTER TABLE admin_classes ADD COLUMN quiz_markdown TEXT DEFAULT ''");
    if (!clsColNames.includes("grade_id")) await db.execute("ALTER TABLE admin_classes ADD COLUMN grade_id TEXT DEFAULT ''");
    // Country scoping for the track library: 'GLOBAL' or an ISO code (US, GB, …).
    try {
      const trackCols = await db.execute("PRAGMA table_info(admin_tracks)");
      const trackColNames = trackCols.rows.map((r: any) => r.name);
      if (!trackColNames.includes("country_code")) await db.execute("ALTER TABLE admin_tracks ADD COLUMN country_code TEXT DEFAULT 'GLOBAL'");
    } catch { /* fresh install — column created via CREATE above */ }
    // Hierarchy: track → grade → course → lesson.
    // course.grade_id links a course to its grade ('' = unassigned, legacy data).
    // lesson (admin_classes).course_id links a lesson to its course ('' = directly in grade).
    try {
      const courseCols = await db.execute("PRAGMA table_info(admin_courses)");
      const courseColNames = courseCols.rows.map((r: any) => r.name);
      if (!courseColNames.includes("grade_id")) await db.execute("ALTER TABLE admin_courses ADD COLUMN grade_id TEXT DEFAULT ''");
    } catch { /* table created fresh below with grade_id */ }
    try {
      if (!clsColNames.includes("course_id")) await db.execute("ALTER TABLE admin_classes ADD COLUMN course_id TEXT DEFAULT ''");
    } catch { /* fresh install — column added via CREATE below */ }
    try {
      // Legacy shape was track → course → grade; grades are now track-level.
      await db.execute("UPDATE admin_track_grades SET course_id = '' WHERE course_id <> ''");
    } catch { /* fresh install or already migrated */ }
  } catch (e) {
    console.warn("Schema migration note:", e);
  }
  await db.execute(`
    CREATE TABLE IF NOT EXISTS student_progress (
      id TEXT PRIMARY KEY DEFAULT 'default',
      points INTEGER DEFAULT 0,
      streakDays INTEGER DEFAULT 0,
      level INTEGER DEFAULT 1,
      completedLessons TEXT DEFAULT '[]',
      unlockedBadges TEXT DEFAULT '[]',
      lastActiveDate TEXT
    )
  `);
  await db.execute(`
    CREATE TABLE IF NOT EXISTS tasks (
      id TEXT PRIMARY KEY,
      title TEXT,
      description TEXT,
      category TEXT,
      rewardPoints INTEGER,
      status TEXT,
      assignee TEXT,
      createdBy TEXT,
      backersCount INTEGER DEFAULT 1
    )
  `);
  await db.execute(`
    CREATE TABLE IF NOT EXISTS sessions (
      token TEXT PRIMARY KEY,
      userId TEXT NOT NULL,
      email TEXT NOT NULL,
      role TEXT DEFAULT 'student',
      createdAt INTEGER NOT NULL,
      expiresAt INTEGER NOT NULL
    )
  `);
  // Migrate existing sessions tables to include the role column
  try {
    const sessCols = await db.execute("PRAGMA table_info(sessions)");
    const sessColNames = sessCols.rows.map((r: any) => r.name);
    if (!sessColNames.includes("role")) {
      await db.execute("ALTER TABLE sessions ADD COLUMN role TEXT DEFAULT 'student'");
    }
  } catch { /* fresh install — table just created with role */ }
  await db.execute(`
    CREATE TABLE IF NOT EXISTS institutions (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      representative_name TEXT NOT NULL,
      country TEXT DEFAULT '',
      grade_range TEXT DEFAULT 'K-12',
      billing_cycle TEXT DEFAULT 'Monthly',
      student_volume INTEGER DEFAULT 1,
      created_at TEXT NOT NULL
    )
  `);
  await db.execute(`
    CREATE TABLE IF NOT EXISTS tutors (
      id TEXT PRIMARY KEY,
      institution_id TEXT NOT NULL,
      name TEXT NOT NULL,
      email TEXT NOT NULL,
      subjects TEXT DEFAULT '[]',
      grade_levels TEXT DEFAULT '[]',
      created_at TEXT NOT NULL
    )
  `);
  await db.execute(`
    CREATE TABLE IF NOT EXISTS institution_admins (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL UNIQUE,
      institution_id TEXT NOT NULL,
      role TEXT DEFAULT 'admin',
      created_at TEXT NOT NULL
    )
  `);
  await db.execute(`
    CREATE TABLE IF NOT EXISTS curriculum_tracks (
      id TEXT PRIMARY KEY,
      country_code TEXT NOT NULL,
      country_name TEXT NOT NULL,
      grade_level TEXT NOT NULL,
      track_type TEXT NOT NULL,
      display_name TEXT NOT NULL,
      lesson_ids TEXT DEFAULT '[]',
      is_default INTEGER DEFAULT 0,
      created_at TEXT NOT NULL
    )
  `);
  await db.execute(`
    CREATE TABLE IF NOT EXISTS lessons (
      id TEXT PRIMARY KEY,
      external_id TEXT UNIQUE,
      title TEXT NOT NULL,
      description TEXT DEFAULT '',
      subject TEXT NOT NULL,
      grade_level TEXT NOT NULL,
      lesson_type TEXT DEFAULT 'content',
      estimated_minutes INTEGER DEFAULT 5,
      content_ref TEXT DEFAULT '',
      quiz_ref TEXT DEFAULT '',
      created_at TEXT NOT NULL
    )
  `);
  await db.execute(`
    CREATE TABLE IF NOT EXISTS exams (
      id TEXT PRIMARY KEY,
      track_id TEXT NOT NULL,
      lesson_id TEXT NOT NULL,
      is_proctored INTEGER DEFAULT 0,
      duration_seconds INTEGER DEFAULT 600,
      passing_score REAL DEFAULT 0.7,
      is_verified INTEGER DEFAULT 1,
      created_at TEXT NOT NULL
    )
  `);
  await db.execute(`
    CREATE TABLE IF NOT EXISTS exam_attempts (
      id TEXT PRIMARY KEY,
      student_id TEXT NOT NULL,
      exam_id TEXT NOT NULL,
      score REAL,
      max_score REAL DEFAULT 1.0,
      proctor_flags TEXT DEFAULT '[]',
      camera_authorized INTEGER DEFAULT 0,
      identity_scan_ref TEXT DEFAULT '',
      status TEXT DEFAULT 'completed',
      started_at TEXT,
      completed_at TEXT
    )
  `);
  await db.execute(`
    CREATE TABLE IF NOT EXISTS institution_curriculum_overrides (
      id TEXT PRIMARY KEY,
      institution_id TEXT NOT NULL,
      grade_level TEXT NOT NULL,
      subject TEXT NOT NULL,
      ordered_lesson_ids TEXT NOT NULL,
      created_by TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `);
  await db.execute(`
    CREATE TABLE IF NOT EXISTS community_posts (
      id TEXT PRIMARY KEY,
      author_id TEXT NOT NULL,
      author_name TEXT NOT NULL,
      author_level INTEGER DEFAULT 1,
      title TEXT NOT NULL,
      content TEXT NOT NULL,
      likes INTEGER DEFAULT 0,
      replies INTEGER DEFAULT 0,
      category TEXT DEFAULT 'General',
      grade_level TEXT DEFAULT 'all',
      moderation_status TEXT DEFAULT 'approved',
      created_at TEXT NOT NULL
    )
  `);
  // No approval queue: publish anything still stuck as pending.
  try {
    await db.execute("UPDATE community_posts SET moderation_status = 'approved' WHERE moderation_status = 'pending'");
  } catch { /* table freshly created — nothing to publish */ }
  await db.execute(`
    CREATE TABLE IF NOT EXISTS admin_tracks (
      id TEXT PRIMARY KEY,
      institution_id TEXT NOT NULL,
      name TEXT NOT NULL,
      description TEXT DEFAULT '',
      grade_level TEXT DEFAULT 'all',
      subject TEXT DEFAULT 'General',
      country_code TEXT DEFAULT 'GLOBAL',
      is_published INTEGER DEFAULT 1,
      created_at TEXT NOT NULL
    )
  `);
  await db.execute(`
    CREATE TABLE IF NOT EXISTS admin_classes (
      id TEXT PRIMARY KEY,
      track_id TEXT NOT NULL,
      institution_id TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT DEFAULT '',
      subject TEXT DEFAULT 'General',
      grade_level TEXT DEFAULT 'all',
      estimated_minutes INTEGER DEFAULT 15,
      content_html TEXT DEFAULT '',
      game_path TEXT DEFAULT '',
      game_filename TEXT DEFAULT '',
      class_code TEXT DEFAULT '',
      quiz_markdown TEXT DEFAULT '',
      grade_id TEXT DEFAULT '',
      course_id TEXT DEFAULT '',
      is_published INTEGER DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `);
  await db.execute(`
    CREATE TABLE IF NOT EXISTS admin_courses (
      id TEXT PRIMARY KEY,
      track_id TEXT NOT NULL,
      institution_id TEXT NOT NULL,
      grade_id TEXT DEFAULT '',
      name TEXT NOT NULL,
      description TEXT DEFAULT '',
      subject TEXT DEFAULT 'General',
      sort_order INTEGER DEFAULT 0,
      created_at TEXT NOT NULL
    )
  `);
  await db.execute(`
    CREATE TABLE IF NOT EXISTS admin_track_grades (
      id TEXT PRIMARY KEY,
      track_id TEXT NOT NULL,
      institution_id TEXT NOT NULL,
      course_id TEXT DEFAULT '',
      grade_level TEXT NOT NULL,
      label TEXT DEFAULT '',
      sort_order INTEGER DEFAULT 0,
      created_at TEXT NOT NULL
    )
  `);
  await db.execute(`
    CREATE TABLE IF NOT EXISTS class_enrollments (
      id TEXT PRIMARY KEY,
      class_id TEXT NOT NULL,
      student_id TEXT NOT NULL,
      enrolled_at TEXT NOT NULL,
      UNIQUE(class_id, student_id)
    )
  `);
  await db.execute(`
    CREATE TABLE IF NOT EXISTS class_progress (
      id TEXT PRIMARY KEY,
      class_id TEXT NOT NULL,
      student_id TEXT NOT NULL,
      score INTEGER DEFAULT 0,
      total INTEGER DEFAULT 0,
      status TEXT DEFAULT 'in_progress',
      completed_at TEXT,
      UNIQUE(class_id, student_id)
    )
  `);
  await db.execute(`
    CREATE TABLE IF NOT EXISTS tutor_class_assignments (
      id TEXT PRIMARY KEY,
      tutor_id TEXT NOT NULL,
      class_id TEXT NOT NULL,
      assigned_at TEXT NOT NULL,
      UNIQUE(tutor_id, class_id)
    )
  `);
  await db.execute(`
    CREATE TABLE IF NOT EXISTS tutor_grade_assignments (
      id TEXT PRIMARY KEY,
      tutor_id TEXT NOT NULL,
      grade_id TEXT NOT NULL,
      assigned_at TEXT NOT NULL,
      UNIQUE(tutor_id, grade_id)
    )
  `);
  await db.execute(`
    CREATE TABLE IF NOT EXISTS student_invites (
      id TEXT PRIMARY KEY,
      institution_id TEXT NOT NULL,
      name TEXT NOT NULL,
      email TEXT NOT NULL,
      grade_level TEXT DEFAULT '5',
      invite_code TEXT NOT NULL UNIQUE,
      status TEXT DEFAULT 'invited',
      claimed_user_id TEXT DEFAULT '',
      created_at TEXT NOT NULL,
      claimed_at TEXT DEFAULT '',
      expires_at TEXT DEFAULT '',
      last_emailed_at TEXT DEFAULT '',
      email_status TEXT DEFAULT 'unsent'
    )
  `);
  // Migrate pre-existing student_invites tables (created before expiry/email columns).
  try {
    const invCols = await db.execute("PRAGMA table_info(student_invites)");
    const invColNames = invCols.rows.map((r: any) => r.name);
    if (!invColNames.includes("expires_at")) await db.execute("ALTER TABLE student_invites ADD COLUMN expires_at TEXT DEFAULT ''");
    if (!invColNames.includes("last_emailed_at")) await db.execute("ALTER TABLE student_invites ADD COLUMN last_emailed_at TEXT DEFAULT ''");
    if (!invColNames.includes("email_status")) await db.execute("ALTER TABLE student_invites ADD COLUMN email_status TEXT DEFAULT 'unsent'");
  } catch { /* fresh install — table just created with all columns */ }
  await db.execute(`
    CREATE TABLE IF NOT EXISTS tutor_invites (
      id TEXT PRIMARY KEY,
      institution_id TEXT NOT NULL,
      name TEXT NOT NULL,
      email TEXT NOT NULL,
      subjects TEXT DEFAULT '[]',
      invite_code TEXT NOT NULL UNIQUE,
      status TEXT DEFAULT 'invited',
      claimed_user_id TEXT DEFAULT '',
      created_at TEXT NOT NULL,
      claimed_at TEXT DEFAULT '',
      expires_at TEXT DEFAULT '',
      last_emailed_at TEXT DEFAULT '',
      email_status TEXT DEFAULT 'unsent'
    )
  `);
  await db.execute(`
    CREATE TABLE IF NOT EXISTS community_replies (
      id TEXT PRIMARY KEY,
      post_id TEXT NOT NULL,
      author_id TEXT NOT NULL,
      author_name TEXT NOT NULL,
      author_level INTEGER DEFAULT 1,
      content TEXT NOT NULL,
      likes INTEGER DEFAULT 0,
      created_at TEXT NOT NULL
    )
  `);
  await db.execute(`
    CREATE TABLE IF NOT EXISTS seat_purchases (
      id TEXT PRIMARY KEY,
      institution_id TEXT NOT NULL,
      spots INTEGER NOT NULL,
      billing_cycle TEXT DEFAULT 'monthly',
      amount_cents INTEGER DEFAULT 0,
      stripe_session_id TEXT NOT NULL UNIQUE,
      created_at TEXT NOT NULL
    )
  `);
  await db.execute(`
    CREATE TABLE IF NOT EXISTS badges (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT DEFAULT '',
      criteria_type TEXT NOT NULL,
      criteria_value TEXT DEFAULT '',
      icon TEXT DEFAULT 'award',
      color TEXT DEFAULT 'text-yellow-400'
    )
  `);
  // Lesson bodies live on disk — export any still stored in DB columns, then clear them.
  const { migrateBodiesToDisk } = await import("./lesson-files");
  await migrateBodiesToDisk();
  // Seed data removed — production database must be populated via admin tools or migrations.
  await seedK12CurriculumMetadata();
  // Canonical Water tracks (insert-if-missing; admin edits are never overwritten).
  const { seedWaterSystemTracks } = await import("./seed-water");
  await seedWaterSystemTracks();
  console.log("✅ Database tables initialized");
}
