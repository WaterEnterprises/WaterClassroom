<script lang="ts">
  import { appState, handleLandingAuthSubmit, executeSendMessage, calculateInstitutionalBulkCost, setLandingAuthRole, setLandingAuthMode, setLandingAuthErrors, setLoginEmail, setLoginAccessKey, setRegName, setRegSchoolName, setRegRepName, setRegStudentVolume, setRegBillingCycle, setSchoolEnrollCode, setStudentBillingCycle, setCalcStudents, setCalcBilling, setContactName, setContactEmail, setContactMsg, setExpandedFaq, lookupInviteCode } from '../lib/store.svelte';
  import { ArrowRight, Compass, Cpu, Building, Calculator, Heart, ChevronDown } from 'lucide-svelte';
  import { fly, fade } from 'svelte/transition';

  const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  const onBlurEmail = () => {
    if (appState.loginEmail && !EMAIL_REGEX.test(appState.loginEmail.trim())) {
      setLandingAuthErrors({ ...appState.landingAuthErrors, email: "Please enter a valid email address." });
    } else if (appState.landingAuthErrors.email) {
      setLandingAuthErrors({ ...appState.landingAuthErrors, email: undefined });
    }
  };

  const onBlurInviteCode = () => {
    const code = (appState.schoolEnrollCode || "").trim().toUpperCase();
    if (/^(STU|TUT)-/.test(code) && code.length >= 8) lookupInviteCode(code);
  };

  const onBlurPassword = () => {
    if (appState.loginAccessKey && appState.loginAccessKey.length < 6) {
      setLandingAuthErrors({ ...appState.landingAuthErrors, password: "Password must be at least 6 characters." });
    } else if (appState.landingAuthErrors.password) {
      setLandingAuthErrors({ ...appState.landingAuthErrors, password: undefined });
    }
  };

  const pillars = [
    { icon: Compass, title: "AI-Tailored Curriculum", desc: "Dynamic lessons aligned with national and international standards, adaptable to individual learning paces and styles. Interactive multimedia content and games are designed to supercharge the learning experience.", color: "blue" },
    { icon: Cpu, title: "24/7 AI Tutoring & Homework", desc: "Our AI tutors offer step-by-step teaching, real-time feedback, and guidance. Advanced automated grading algorithms provide actionable insights for both students and educators around the clock.", color: "cyan" },
    { icon: Building, title: "Innovation & Creativity Labs", desc: "Project-based learning modules connect core concepts to real-world scenarios. Engage in gamified engineering challenges and creative problem-solving to foster critical thinking and boundless imagination.", color: "indigo" },
    { icon: Calculator, title: "Progress Analytics Dashboard", desc: "Users can rigorously track academic performance, engagement streaks, and skill development. Generates customizable, detailed growth reports for teachers, parents, and administrative oversight.", color: "emerald" },
    { icon: Heart, title: "Collaborative Learning Ecosystem", desc: "The platform includes seamlessly integrated virtual classrooms, moderated peer discussion forums, and dedicated educator tools, crafting a shared environment for robust curriculum management.", color: "rose" },
  ];

  const steps = [
    { step: "01", title: "Select a Curriculum Track", desc: "Choose your primary curriculum (e.g. U.S. Common Core, UK GCSE, IB) or use a school invite code." },
    { step: "02", title: "Interactive Lectures & Games", desc: "Access the Open Academy for fun, AI-delivered multimedia lessons and games tailored to your curriculum." },
    { step: "03", title: "24/7 AI Tutor & Innovation Labs", desc: "Solve real-world homework challenges with our 24/7 AI Socratic Companion, adapting to gifted and struggling learners alike." },
    { step: "04", title: "Verified Exams & Badges", desc: "Complete automated assessments and secure exams via camera to earn Achievement Badges and maintain Learning Streaks." }
  ];

  const faqs = [
    { q: "How does the Water Classroom Socratic Companion tutor students?", a: "Our AI Tutor utilizes deep inquiry pedagogy. Instead of simple answer-spitting, the Socratic Tutor asks prompting questions, asks students to elaborate, and guides them step-by-step." },
    { q: "How does the browser-based Proctor exam verification work?", a: "The voluntary exam verification utilizes the client's local computer camera purely client-side to track eye vectors, facial presence, and ambient volumes. This secures academic integrity transparently." },
    { q: "What curriculum metrics are mapped inside the Academy?", a: "Water Classroom lessons map to top global criteria, including K-12 US Common Core, UK GCSE, and International Baccalaureate (IB) frameworks." },
    { q: "How do homeschooling parents track and submit grades?", a: "Parent mentors can set up a custom administrator registry, link student nodes, track points, and download cumulative grade sheets as portable CSV documents." },
    { q: "Can high-schoolers obtain STEM credits through robotics sims?", a: "Yes. Our mechanical simulation games are formulated using actual physics values. Passing exam scores on these tasks awards certified transcript badges." },
    { q: "Is there any cost for self-taught or struggling individual students?", a: "Zero cost for basic reading access, forum participation, and standard simulation attempts, sponsored through the Stellarium Foundation grant program." },
    { q: "What licensing options are structured for custom co-ops?", a: "School plans for $12 per student per month (or $144/year under bulk agreements). Includes bulk student deployments, custom dashboards, and automated registry tools." },
    { q: "Is student user data privately protected?", a: "Absolutely. All session tokens, passcodes, and student logs remain fully secure inside the local browser context. No external marketing surveillance can access user progression." },
    { q: "Can our homeschool group register as an institution split across multiple regions?", a: "Yes! The system supports co-ops, microschools, and academies of any size. A shareable Access Key is generated for global registration." },
    { q: "How do individual student registration tracks differ?", a: "Water Students ($19/mo) get verified proctored exams and a valid school certificate — ideal for homeschoolers. Independent Students ($15/mo) get full curriculum access, AI tutoring, and labs but no proctored exams or diploma. School Students ($12/mo, sponsored by their school) get the same full resources as Independent, without exams." },
    { q: "What does a Water School Student get that others don't?", a: "Water School Students receive fully verified proctored exams with browser-based camera proctoring and a valid Water Classroom school certificate/diploma. This is designed for homeschool families seeking accredited credentialing." },
    { q: "Are there any hidden setup fees, API fees, or LMS surcharges?", a: "No. Every registered institution plan receives full grading databases, local roster sync, and direct support services for a flat $12/student/month." },
    { q: "Which payment options are accepted?", a: "All math and invoices correspond with standard USD. No immediate payment method is required to configure a school plan or independent student login profile." }
  ];
</script>

<div class="space-y-16 animate-fade-in text-slate-100 pb-12">
  <!-- Hero Pitch Banner -->
  <div transition:fly={{ y: 20, duration: 400 }} class="blue-gradient-bg rounded-3xl p-6 sm:p-12 text-white relative overflow-hidden shadow-2xl border border-blue-400/20">
    <div class="absolute right-0 top-0 -mr-16 -mt-16 w-64 h-64 bg-blue-300/30 rounded-full blur-3xl"></div>
    <div class="absolute left-1/3 bottom-0 -mb-16 w-80 h-80 bg-cyan-300/25 rounded-full blur-3xl"></div>
    <div class="relative z-10 max-w-4xl space-y-6">
      <span class="px-3.5 py-1.5 rounded-full bg-blue-900/60 text-[10px] font-extrabold uppercase tracking-widest border border-blue-300/30 backdrop-blur-md animate-pulse">
        ✨ NOW OPEN: A NEW ERA OF HUMAN LEARNING
      </span>
      <h2 class="text-4xl sm:text-6xl font-extrabold tracking-tight leading-tight uppercase font-sans">
        The Water Classroom:<br class="hidden sm:block" /> Redefining Education in the AI Era
      </h2>
      <p class="text-sm sm:text-lg text-blue-50 font-normal leading-relaxed max-w-3xl font-light">
        Break down institutional barriers once and for all. We provide K-12 and undergraduate students, educators, and institutions with a complete, AI-powered virtual school. Engage with gamified curriculums tailored to U.S. Common Core, UK GCSE or IB tracks, consult 24/7 AI tutors, and unleash creativity with interactive labs—all from a single, transformative platform.
      </p>
      <div class="flex flex-wrap gap-4 pt-4">
        <a href="#auth-section" class="px-8 py-3.5 rounded-xl bg-white text-blue-950 font-extrabold text-xs tracking-wider uppercase transition hover:bg-blue-50 active:scale-95 shadow-lg flex items-center gap-2 cursor-pointer no-underline">
          Enter Student & Institution Portal <ArrowRight class="w-4 h-4 text-blue-600" />
        </a>
        <a href="#prices-section" class="px-6 py-3.5 rounded-xl bg-slate-900 border border-slate-700 text-slate-300 hover:bg-slate-800 transition text-xs font-bold uppercase tracking-wider flex items-center gap-2 cursor-pointer no-underline">
          View Pricing & Plans
        </a>
      </div>
    </div>
  </div>

  <!-- Auth Section -->
  <div id="auth-section" transition:fly={{ y: 20, duration: 400 }} class="grid grid-cols-1 lg:grid-cols-12 gap-8 items-stretch pt-2">
    <div class="lg:col-span-5 flex flex-col justify-center space-y-6">
      <span class="text-xs font-mono uppercase text-blue-400 tracking-wider font-bold">Secure Access Gateway</span>
      <h3 class="text-3xl font-extrabold text-white uppercase leading-tight">Create your Student ledger or register your school</h3>
      <p class="text-sm text-slate-300 leading-relaxed font-light">Welcome to the decentralized enrollment protocol. Select your division and complete authentication.</p>
      <div class="space-y-4 pt-2">
        <div class="flex items-start gap-3">
          <div class="w-6 h-6 rounded bg-blue-950 border border-blue-500/20 text-blue-400 flex items-center justify-center p-1 mt-0.5 text-xs font-bold">✓</div>
          <div>
            <h4 class="text-sm font-bold text-white uppercase">Independent Student Records</h4>
            <p class="text-xs text-slate-400 leading-relaxed font-light">Gain instant access to physics reactors, first-principles logic modules, and 24/7 Socratic help.</p>
          </div>
        </div>
        <div class="flex items-start gap-3">
          <div class="w-6 h-6 rounded bg-indigo-950 border border-indigo-500/20 text-indigo-400 flex items-center justify-center p-1 mt-0.5 text-xs font-bold">✓</div>
          <div>
            <h4 class="text-sm font-bold text-white uppercase">Institutional Microschool Sandboxing</h4>
            <p class="text-xs text-slate-400 leading-relaxed font-light">Activate group profiles, manage customized task assignments, and review eye-tracking focal proctor audits.</p>
          </div>
        </div>
      </div>
    </div>
    <div class="lg:col-span-1"></div>
    <div class="lg:col-span-6">
      <div class="frosted-glass p-6 sm:p-8 rounded-3xl border border-blue-500/20 shadow-2xl relative overflow-hidden flex flex-col h-full justify-between">
        <div class="absolute right-0 top-0 -mr-16 -mt-16 w-48 h-48 bg-blue-500/5 rounded-full blur-3xl pointer-events-none"></div>
        <div class="space-y-6">
          <div class="grid grid-cols-2 gap-1.5 p-1 bg-slate-950/60 rounded-xl border border-blue-950">
            {#each [{ key: "student", label: "Student", icon: "🎓", color: "bg-blue-600" }, { key: "institution", label: "Institution", icon: "🏛️", color: "bg-indigo-600" }] as opt (opt.key)}
              {@const isStudentMode = appState.landingAuthRole !== "institution"}
              {@const isActive = opt.key === "student" ? isStudentMode : appState.landingAuthRole === "institution"}
              <button
                onclick={() => {
                  if (opt.key === "student") {
                    if (appState.landingAuthRole === "institution") setLandingAuthRole("water-student");
                  } else {
                    setLandingAuthRole("institution");
                  }
                }}
                class="py-2 sm:py-3 text-[10px] sm:text-xs font-bold rounded-lg transition-all flex flex-col items-center justify-center gap-0.5 uppercase leading-tight {isActive ? `${opt.color} text-white shadow-md font-extrabold` : 'text-slate-400 hover:text-slate-200'}"
              >
                <span class="text-sm">{opt.icon}</span>
                <span>{opt.label}</span>
              </button>
            {/each}
          </div>
          <form onsubmit={handleLandingAuthSubmit} class="space-y-4" novalidate>
            <!-- Login / Register toggle -->
            <div class="grid grid-cols-2 p-0.5 bg-slate-950/80 rounded-lg border border-slate-800">
              <button type="button" onclick={() => { setLandingAuthMode("login"); setLandingAuthErrors({}); }}
                class="py-2.5 text-xs font-bold rounded-md transition-all flex items-center justify-center gap-1.5 uppercase {appState.landingAuthMode === 'login' ? 'bg-blue-600 text-white shadow-md font-extrabold' : 'text-slate-400 hover:text-slate-200'}">
                🔑 Login
              </button>
              <button type="button" onclick={() => { setLandingAuthMode("register"); setLandingAuthErrors({}); }}
                class="py-2.5 text-xs font-bold rounded-md transition-all flex items-center justify-center gap-1.5 uppercase {appState.landingAuthMode === 'register' ? 'bg-emerald-600 text-white shadow-md font-extrabold' : 'text-slate-400 hover:text-slate-200'}">
                📝 Register
              </button>
            </div>

            <!-- Inline form-level error -->
            {#if appState.landingAuthErrors.form}
              <div class="bg-rose-950/80 border border-rose-500/40 text-rose-300 p-3 rounded-xl text-[11px] font-mono animate-fade-in">
                ⚠ {appState.landingAuthErrors.form}
              </div>
            {/if}

            <!-- Success message -->
            {#if appState.tursoSuccessMsg}
              <div class="bg-emerald-950/80 border border-emerald-500/40 text-emerald-300 p-3.5 rounded-xl text-xs space-y-1 font-mono animate-fade-in">
                <span class="font-bold text-white block">✓ RECORD COMMITTED SECURELY</span>
                <p>{appState.tursoSuccessMsg}</p>
              </div>
            {/if}

            <!-- Portal description -->
            {#if appState.landingAuthRole === "tutor"}
              <div class="bg-[#3a2a0b] border border-amber-900/30 rounded-xl p-3 text-xs text-amber-300 space-y-1">
                <span class="font-bold text-white block text-[10px] uppercase font-mono tracking-wider">🎓 Tutor Portal</span>
                {appState.landingAuthMode === "login" ? "Sign in to access your assigned classes, students, and moderation tools." : "Register with your school's tutor invite code — Academy access plus your assigned classes, students, and forum moderation."}
              </div>
            {:else if appState.landingAuthRole !== "institution"}
              <div class="bg-[#0b2940] border border-blue-900/30 rounded-xl p-3 text-xs text-blue-300 space-y-1">
                <span class="font-bold text-white block text-[10px] uppercase font-mono tracking-wider">🎓 Student Portal</span>
                {appState.landingAuthMode === "login" ? "Sign in to access your curriculum, AI tutor, and learning dashboard." : "Register to begin your learning journey. Choose your plan (Water School, Independent, or School-enrolled) during onboarding."}
              </div>
            {/if}
            {#if appState.landingAuthRole === "institution"}
              <div class="bg-[#11103a] border border-indigo-900/30 rounded-xl p-3 text-xs text-indigo-300 space-y-1">
                <span class="font-bold text-white block text-[10px] uppercase font-mono tracking-wider">🏛️ Institution Portal</span>
                {appState.landingAuthMode === "login" ? "Sign in with your coordinator credentials to manage rosters, settings, and reports." : "Register your school or co-op to deploy group profiles, assign students, and access admin tools."}
              </div>
            {/if}

            <!-- REGISTER: Student extra fields -->
            {#if appState.landingAuthMode === "register" && appState.landingAuthRole !== "institution"}
              <div class="space-y-3 animate-fade-in">
                {#if appState.inviteCodeFromUrl}
                  <div class="rounded-xl border border-emerald-700/50 bg-emerald-950/40 p-3 text-xs text-emerald-200">
                    <span class="font-bold text-white block text-[10px] uppercase font-mono tracking-wider">🎓 You were invited!</span>
                    {#if appState.inviteLookup.status === "valid" && appState.inviteLookup.kind === "tutor"}
                      {appState.inviteLookup.schoolName} invited you as a <strong>tutor</strong> — your code is filled in below. Add your name, use your invited email, and create a password to activate your Tutor account.
                    {:else if appState.inviteLookup.status === "valid"}
                      {appState.inviteLookup.schoolName} invited you — your code is filled in below. Just add your name, use your invited email, and create a password.
                    {:else}
                      Your invite code is filled in below — add your name, use your invited email, and create a password.
                    {/if}
                  </div>
                {/if}
                <div class="space-y-1">
                  <label class="text-[10px] uppercase font-mono text-slate-400 font-bold block">Full Name <span class="text-rose-400">*</span></label>
                  <input type="text" required placeholder="e.g. Alice Vance"
                    value={appState.regName} oninput={(e) => setRegName((e.target as HTMLInputElement).value)}
                    class="w-full rounded-xl bg-slate-900 border border-slate-700 px-3.5 py-2.5 text-xs text-white focus:outline-none focus:border-blue-500" />
                  {#if appState.landingAuthErrors.name}<p class="text-rose-400 text-[10px] mt-0.5 font-mono">⚠ {appState.landingAuthErrors.name}</p>{/if}
                </div>
                <div class="space-y-1">
                  <label class="text-[10px] uppercase font-mono text-slate-400 font-bold block">School / Invite Code (Optional)</label>
                  <input type="text" placeholder="e.g. STU-7F3K2M"
                    value={appState.schoolEnrollCode} oninput={(e) => { setSchoolEnrollCode((e.target as HTMLInputElement).value.toUpperCase()); if (appState.inviteLookup.status !== "idle") appState.inviteLookup = { status: "idle", kind: "", schoolName: "", studentName: "", gradeLevel: "", error: "" }; }}
                    onblur={onBlurInviteCode}
                    class="w-full rounded-xl bg-slate-900 border border-slate-700 px-3.5 py-2.5 text-xs text-white focus:outline-none focus:border-blue-500 uppercase tracking-widest font-mono" />
                  {#if appState.inviteLookup.status === "checking"}
                    <p class="text-[9px] text-slate-400 mt-0.5 font-mono">Checking invite code…</p>
                  {:else if appState.inviteLookup.status === "valid"}
                    <p class="text-[9px] text-emerald-300 mt-0.5 font-mono">✓ Invited by {appState.inviteLookup.schoolName} — free account, billed to your school. Sign up with your invited email.</p>
                  {:else if appState.inviteLookup.status === "invalid"}
                    <p class="text-[9px] text-rose-400 mt-0.5 font-mono">⚠ {appState.inviteLookup.error}</p>
                  {:else}
                    <p class="text-[9px] text-slate-500 mt-0.5">Paste the personal invite code from your school email (links + activates you instantly), or a school-wide code.</p>
                  {/if}
                </div>
                <p class="text-[10px] text-slate-500 font-mono">
                  💰 Choose your plan during onboarding: Water Student ($19/mo), Independent ($15/mo), or School Student ($12/mo, billed to school).
                </p>
              </div>
            {/if}

            <!-- REGISTER: Institution extra fields -->
            {#if appState.landingAuthMode === "register" && appState.landingAuthRole === "institution"}
              <div class="space-y-3 animate-fade-in">
                <div class="space-y-1">
                  <label class="text-[10px] uppercase font-mono text-slate-400 font-bold block">School / Institution Name <span class="text-rose-400">*</span></label>
                  <input type="text" required placeholder="e.g. Sovereign Florida Homeschool"
                    value={appState.regSchoolName} oninput={(e) => setRegSchoolName((e.target as HTMLInputElement).value)}
                    class="w-full rounded-xl bg-slate-900 border border-slate-700 px-3.5 py-2.5 text-xs text-white focus:outline-none focus:border-blue-500" />
                  {#if appState.landingAuthErrors.schoolName}<p class="text-rose-400 text-[10px] mt-0.5 font-mono">⚠ {appState.landingAuthErrors.schoolName}</p>{/if}
                </div>
                <div class="space-y-1">
                  <label class="text-[10px] uppercase font-mono text-slate-400 font-bold block">Representative / Admin Name <span class="text-rose-400">*</span></label>
                  <input type="text" required placeholder="e.g. Teacher Harrison"
                    value={appState.regRepName} oninput={(e) => setRegRepName((e.target as HTMLInputElement).value)}
                    class="w-full rounded-xl bg-slate-900 border border-slate-700 px-3.5 py-2.5 text-xs text-white focus:outline-none focus:border-blue-500" />
                  {#if appState.landingAuthErrors.repName}<p class="text-rose-400 text-[10px] mt-0.5 font-mono">⚠ {appState.landingAuthErrors.repName}</p>{/if}
                </div>
                <div class="grid grid-cols-2 gap-3">
                  <div class="space-y-1">
                    <label class="text-[10px] uppercase font-mono text-slate-400 font-bold block">Student Volume</label>
                    <input type="number" min={1} max={5000} value={appState.regStudentVolume}
                      oninput={(e) => setRegStudentVolume(Math.max(1, parseInt((e.target as HTMLInputElement).value) || 1))}
                      class="w-full rounded-xl bg-slate-900 border border-slate-700 px-3.5 py-2.5 text-xs text-white focus:outline-none focus:border-blue-500 font-mono" />
                  </div>
                  <div class="space-y-1">
                    <label class="text-[10px] uppercase font-mono text-slate-400 font-bold block">Billing Cycle</label>
                    <div class="flex gap-1.5">
                      <button type="button" onclick={() => setRegBillingCycle("Monthly")}
                        class="flex-1 py-2 text-[10px] font-bold rounded-lg border transition {appState.regBillingCycle === 'Monthly' ? 'bg-indigo-600 text-white border-indigo-500' : 'bg-slate-900 border-slate-700 text-slate-400'}">
                        Monthly
                      </button>
                      <button type="button" onclick={() => setRegBillingCycle("Yearly")}
                        class="flex-1 py-2 text-[10px] font-bold rounded-lg border transition {appState.regBillingCycle === 'Yearly' ? 'bg-indigo-600 text-white border-indigo-500' : 'bg-slate-900 border-slate-700 text-slate-400'}">
                        Yearly
                      </button>
                    </div>
                  </div>
                </div>
                <div class="space-y-1">
                  <label class="text-[10px] uppercase font-mono text-slate-400 font-bold block">School Access Code (Optional)</label>
                  <input type="text" placeholder="e.g. W-ROSTER-2026"
                    value={appState.schoolEnrollCode} oninput={(e) => setSchoolEnrollCode((e.target as HTMLInputElement).value.toUpperCase())}
                    class="w-full rounded-xl bg-slate-900 border border-slate-700 px-3.5 py-2.5 text-xs text-white focus:outline-none focus:border-indigo-500 uppercase tracking-widest font-mono" />
                </div>
                <p class="text-[10px] text-slate-500 font-mono">
                  💰 Est. cost: ${(appState.regStudentVolume * 12 * (appState.regBillingCycle === "Yearly" ? 12 : 1)).toLocaleString()} {appState.regBillingCycle === "Yearly" ? "/ Year" : "/ Month"} ($12/student)
                </p>
              </div>
            {/if}

            <!-- Email -->
            <div in:fly={{ y: 10, duration: 200 }} class="space-y-1">
              <label class="text-[10px] uppercase font-mono text-slate-400 font-bold block">Email Address <span class="text-rose-400">*</span></label>
              <input type="email" required
                placeholder={appState.landingAuthRole === "institution" ? "e.g. admin@school.edu" : "e.g. student@school.edu"}
                value={appState.loginEmail} oninput={(e) => setLoginEmail((e.target as HTMLInputElement).value)}
                onblur={onBlurEmail}
                class="w-full rounded-xl bg-slate-900 border px-3.5 py-2.5 text-xs text-white focus:outline-none {appState.landingAuthErrors.email ? 'border-rose-500 focus:border-rose-400' : 'border-slate-700 focus:border-blue-500'}" />
              {#if appState.landingAuthErrors.email}<p class="text-rose-400 text-[10px] mt-0.5 font-mono">⚠ {appState.landingAuthErrors.email}</p>{/if}
            </div>

            <!-- Password -->
            <div in:fly={{ y: 10, duration: 200 }} class="space-y-1">
              <label class="text-[10px] uppercase font-mono text-slate-400 font-bold block">Password <span class="text-rose-400">*</span></label>
              <input type="password" required
                placeholder={appState.landingAuthMode === "register" ? "Create a password (min 6 characters)" : "Enter your password"}
                value={appState.loginAccessKey} oninput={(e) => setLoginAccessKey((e.target as HTMLInputElement).value)}
                onblur={onBlurPassword}
                class="w-full rounded-xl bg-slate-900 border px-3.5 py-2.5 text-xs text-white focus:outline-none font-mono {appState.landingAuthErrors.password ? 'border-rose-500 focus:border-rose-400' : 'border-slate-700 focus:border-blue-500'}" />
              {#if appState.landingAuthErrors.password}<p class="text-rose-400 text-[10px] mt-0.5 font-mono">⚠ {appState.landingAuthErrors.password}</p>{/if}
              {#if appState.landingAuthMode === "register" && appState.loginAccessKey.length > 0 && !appState.landingAuthErrors.password}
                <div class="flex items-center gap-1.5 mt-1">
                  <div class="h-1 flex-1 rounded-full {appState.loginAccessKey.length >= 6 ? 'bg-emerald-500' : 'bg-slate-700'}"></div>
                  <div class="h-1 flex-1 rounded-full {appState.loginAccessKey.length >= 8 ? 'bg-emerald-500' : 'bg-slate-700'}"></div>
                  <div class="h-1 flex-1 rounded-full {appState.loginAccessKey.length >= 12 ? 'bg-emerald-500' : 'bg-slate-700'}"></div>
                  <span class="text-[9px] text-slate-500 font-mono ml-1">
                    {appState.loginAccessKey.length < 6 ? "Weak" : appState.loginAccessKey.length < 8 ? "Fair" : appState.loginAccessKey.length < 12 ? "Strong" : "Very Strong"}
                  </span>
                </div>
              {/if}
            </div>

            <!-- Submit button -->
            <button in:fly={{ y: 10, duration: 200 }} type="submit" disabled={appState.tursoLoading}
              class="w-full py-3 h-11 rounded-xl font-extrabold text-xs uppercase tracking-wider shadow-lg transition active:scale-98 flex items-center justify-center gap-1.5 text-white mt-4 disabled:opacity-50 disabled:cursor-not-allowed {appState.landingAuthMode === 'login' ? (appState.landingAuthRole === 'institution' ? 'bg-indigo-600 hover:bg-indigo-500 shadow-indigo-500/20' : 'bg-blue-600 hover:bg-blue-500 shadow-blue-500/20') : 'bg-emerald-600 hover:bg-emerald-500 shadow-emerald-500/20'}">
              {appState.tursoLoading
                ? (appState.landingAuthMode === "login" ? "Signing in..." : "Creating account...")
                : (appState.landingAuthMode === "login" ? "Sign In" : "Create Account")}
              {#if !appState.tursoLoading}<ArrowRight class="w-3.5 h-3.5" />{/if}
            </button>
          </form>
        </div>
        <p class="text-[10px] text-slate-500 text-center mt-3 leading-snug">
          Secured by standard SHA-256 client credentials. All curriculum logs and active student score charts store temporarily inside direct client state.<br />
          For support, contact: stellar.foundation.us@gmail.com
        </p>
      </div>
    </div>
  </div>

  <!-- Strategic Pillars -->
  <div transition:fly={{ y: 20, duration: 400 }} class="space-y-6">
    <div class="text-center max-w-2xl mx-auto space-y-2">
      <h3 class="text-xs uppercase tracking-widest font-mono text-blue-400 font-extrabold">Executive Summary</h3>
      <h4 class="text-2xl sm:text-3xl font-extrabold text-white uppercase">A Complete Educational Ecosystem</h4>
      <p class="text-xs sm:text-sm text-slate-400 font-light">The Water Classroom democratizes access to high-quality education. By integrating cutting-edge artificial intelligence with comprehensive curriculum alignment, we bridge educational gaps and empower K-12 to undergraduate learners globally.</p>
    </div>
    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      {#each pillars as pillar, idx (idx)}
        <div class="frosted-glass rounded-2xl p-6 shadow-lg space-y-4 transition-all duration-300 hover:scale-102 {idx === 4 ? 'lg:col-span-2 lg:flex lg:gap-6 lg:items-center lg:space-y-0' : ''}">
          <div class="w-12 h-10 rounded-xl bg-{pillar.color}-950/50 border border-{pillar.color}-400/30 flex items-center justify-center text-{pillar.color}-400 {idx === 4 ? 'lg:w-16 lg:h-16 shrink-0' : ''}">
            <svelte:component this={pillar.icon} class="w-6 h-6 {pillar.icon === Cpu ? 'animate-pulse' : ''}" />
          </div>
          <div class={idx === 4 ? 'space-y-1' : 'space-y-4'}>
            <h3 class="text-lg font-bold text-white uppercase tracking-wide">{pillar.title}</h3>
            <p class="text-xs text-slate-300 leading-relaxed font-light">{pillar.desc}</p>
          </div>
        </div>
      {/each}
    </div>
  </div>

  <!-- Pipeline -->
  <div transition:fly={{ y: 20, duration: 400 }} class="frosted-glass rounded-3xl p-6 sm:p-10 border border-blue-900/30 shadow-xl space-y-8">
    <div class="space-y-2">
      <h3 class="text-xs uppercase tracking-widest font-mono text-blue-400 font-bold">THE INTAKE PIPELINE</h3>
      <h4 class="text-xl sm:text-2xl font-extrabold text-white uppercase">The 4-Step Student Journey</h4>
      <p class="text-xs text-slate-400 max-w-xl">Whether you are enrolling as a private homeschool student or a classroom group, our pipeline takes you from zero to verifiable credentialing.</p>
    </div>
    <div class="grid grid-cols-1 sm:grid-cols-4 gap-6">
      {#each steps as item, idx (idx)}
        <div class="bg-slate-950/40 p-5 rounded-xl border border-blue-950 flex flex-col justify-between space-y-3 relative overflow-hidden group">
          <div class="absolute right-0 top-0 text-[5rem] font-bold text-blue-500/5 select-none font-mono -mt-6 leading-none transition duration-350 group-hover:text-blue-500/10">{item.step}</div>
          <div class="space-y-1 z-10">
            <span class="text-[10px] font-mono text-blue-400 font-extrabold uppercase bg-blue-950 border border-blue-900/40 px-2 py-0.5 rounded">STEP {item.step}</span>
            <h5 class="font-extrabold text-white text-sm pt-1">{item.title}</h5>
          </div>
          <p class="text-[11px] text-slate-400 leading-relaxed font-light z-10">{item.desc}</p>
        </div>
      {/each}
    </div>
  </div>

  <!-- Pricing -->
  <div id="prices-section" transition:fly={{ y: 20, duration: 400 }} class="space-y-8">
    <div class="text-center max-w-2xl mx-auto space-y-2">
      <span class="text-xs uppercase tracking-widest font-mono text-cyan-400 font-extrabold">STUDENT PLANS & SUBSCRIPTIONS</span>
      <h3 class="text-2xl sm:text-3xl font-extrabold text-white uppercase">Choose Your Path</h3>
      <p class="text-xs text-slate-400">Every student deserves the right tools for their learning journey.</p>
    </div>
    <div class="flex items-center justify-center gap-2 bg-slate-900/60 p-1.5 rounded-xl border border-slate-800 max-w-[280px] mx-auto mb-6">
      <button onclick={() => setStudentBillingCycle("monthly")}
        class="px-5 py-2 text-[10px] font-bold rounded-lg uppercase tracking-wider transition {appState.studentBillingCycle === 'monthly' ? 'bg-blue-600 text-white shadow-md' : 'text-slate-400 hover:text-slate-200'}"
      >Monthly Billing</button>
      <button onclick={() => setStudentBillingCycle("yearly")}
        class="px-5 py-2 text-[10px] font-bold rounded-lg uppercase tracking-wider transition {appState.studentBillingCycle === 'yearly' ? 'bg-blue-600 text-white shadow-md' : 'text-slate-400 hover:text-slate-200'}"
      >Yearly Billing <span class="text-emerald-400 text-[8px]">Save ~17%</span></button>
    </div>
    <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
      <!-- Water Student -->
      <div class="bg-blue-950/20 border-2 border-blue-600/50 rounded-2xl p-5 space-y-3 flex flex-col justify-between relative shadow-lg group hover:border-blue-400 transition">
        <div class="absolute -top-2.5 right-3 bg-blue-600 text-[7px] text-white font-bold px-2 py-0.5 rounded-full uppercase tracking-wider animate-pulse">Certificate Track</div>
        <div class="space-y-2.5">
          <span class="text-2xl">🌊</span>
          <h4 class="text-base font-bold text-white uppercase">Water Student</h4>
          <p class="text-[10px] text-blue-200 leading-relaxed font-light">Homeschool with official proctored exams and a valid school certificate.</p>
          <div class="py-1">
            {#if appState.studentBillingCycle === "yearly"}
              <strong class="text-3xl font-extrabold text-blue-400 font-mono">$190</strong>
              <span class="text-[10px] text-slate-300 ml-1 font-mono">/ Year <span class="text-emerald-400 text-[9px]">(Save $38)</span></span>
            {:else}
              <strong class="text-3xl font-extrabold text-blue-400 font-mono">$19</strong>
              <span class="text-[10px] text-slate-300 ml-1 font-mono">/ Month</span>
            {/if}
          </div>
          <ul class="text-[10px] text-slate-300 space-y-1.5 pt-2 border-t border-blue-900/30 leading-relaxed">
            <li class="flex items-center gap-1.5"><span class="text-blue-400 font-semibold">✓</span> Verified proctored exams</li>
            <li class="flex items-center gap-1.5"><span class="text-blue-400 font-semibold">✓</span> Valid school certificate / diploma</li>
            <li class="flex items-center gap-1.5"><span class="text-blue-400 font-semibold">✓</span> Full curriculum & 24/7 AI tutor</li>
            <li class="flex items-center gap-1.5"><span class="text-blue-400 font-semibold">✓</span> Robotics labs & progress analytics</li>
          </ul>
        </div>
        <a href="#auth-section" onclick={() => setLandingAuthRole("water-student")} class="block w-full py-2 bg-blue-600 hover:bg-blue-500 text-center text-[10px] font-extrabold uppercase rounded-xl text-white shadow-lg transition mt-2 no-underline">
          Enroll — {appState.studentBillingCycle === "yearly" ? "$190/yr" : "$19/mo"}
        </a>
      </div>

      <!-- Independent Student -->
      <div class="bg-emerald-950/15 border-2 border-emerald-700/40 rounded-2xl p-5 space-y-3 flex flex-col justify-between relative shadow-lg group hover:border-emerald-500 transition">
        <div class="absolute -top-2.5 right-3 bg-emerald-700 text-[7px] text-white font-bold px-2 py-0.5 rounded-full uppercase tracking-wider">Study Aid</div>
        <div class="space-y-2.5">
          <span class="text-2xl">🎓</span>
          <h4 class="text-base font-bold text-white uppercase">Independent</h4>
          <p class="text-[10px] text-emerald-200 leading-relaxed font-light">AI tutoring, curriculum access, and tools to help you ace your existing school.</p>
          <div class="py-1">
            {#if appState.studentBillingCycle === "yearly"}
              <strong class="text-3xl font-extrabold text-emerald-400 font-mono">$150</strong>
              <span class="text-[10px] text-slate-300 ml-1 font-mono">/ Year <span class="text-emerald-400 text-[9px]">(Save $30)</span></span>
            {:else}
              <strong class="text-3xl font-extrabold text-emerald-400 font-mono">$15</strong>
              <span class="text-[10px] text-slate-300 ml-1 font-mono">/ Month</span>
            {/if}
          </div>
          <ul class="text-[10px] text-slate-300 space-y-1.5 pt-2 border-t border-emerald-900/30 leading-relaxed">
            <li class="flex items-center gap-1.5"><span class="text-emerald-400 font-semibold">✓</span> Full curriculum access</li>
            <li class="flex items-center gap-1.5"><span class="text-emerald-400 font-semibold">✓</span> 24/7 AI tutor & homework help</li>
            <li class="flex items-center gap-1.5"><span class="text-emerald-400 font-semibold">✓</span> Interactive labs & games</li>
            <li class="flex items-center gap-1.5"><span class="text-slate-500">✗</span> No proctored exams or diploma</li>
          </ul>
        </div>
        <a href="#auth-section" onclick={() => setLandingAuthRole("independent-student")} class="block w-full py-2 bg-emerald-700 hover:bg-emerald-600 text-center text-[10px] font-extrabold uppercase rounded-xl text-white shadow-lg transition mt-2 no-underline">
          Enroll — {appState.studentBillingCycle === "yearly" ? "$150/yr" : "$15/mo"}
        </a>
      </div>

      <!-- School Student -->
      <div class="bg-amber-950/15 border-2 border-amber-700/40 rounded-2xl p-5 space-y-3 flex flex-col justify-between relative shadow-lg group hover:border-amber-500 transition">
        <div class="absolute -top-2.5 right-3 bg-amber-700 text-[7px] text-white font-bold px-2 py-0.5 rounded-full uppercase tracking-wider">Sponsored</div>
        <div class="space-y-2.5">
          <span class="text-2xl">🏫</span>
          <h4 class="text-base font-bold text-white uppercase">School Student</h4>
          <p class="text-[10px] text-amber-200 leading-relaxed font-light">Signed up by your school. Full resources to help you learn and become a great student.</p>
          <div class="py-1">
            <strong class="text-3xl font-extrabold text-amber-400 font-mono">$12</strong>
            <span class="text-[10px] text-slate-300 ml-1 font-mono">/ Student / Month</span>
            <br />
            <span class="text-[9px] text-slate-500 block mt-0.5">Volume pricing — billed directly to your school</span>
          </div>
          <ul class="text-[10px] text-slate-300 space-y-1.5 pt-2 border-t border-amber-900/30 leading-relaxed">
            <li class="flex items-center gap-1.5"><span class="text-amber-400 font-semibold">✓</span> Full Water Classroom resources</li>
            <li class="flex items-center gap-1.5"><span class="text-amber-400 font-semibold">✓</span> 24/7 AI tutor & progress tracking</li>
            <li class="flex items-center gap-1.5"><span class="text-amber-400 font-semibold">✓</span> Curriculum-aligned content</li>
            <li class="flex items-center gap-1.5"><span class="text-slate-500">✗</span> No proctored exams or diploma</li>
          </ul>
        </div>
        <a href="#auth-section" onclick={() => setLandingAuthRole("water-student")} class="block w-full py-2 bg-amber-700 hover:bg-amber-600 text-center text-[10px] font-extrabold uppercase rounded-xl text-white shadow-lg transition mt-2 no-underline">
          Refer Water Classroom to Your School →
        </a>
      </div>

      <!-- Institution -->
      <div class="bg-indigo-950/15 border-2 border-indigo-700/40 rounded-2xl p-5 space-y-3 flex flex-col justify-between relative shadow-lg group hover:border-indigo-400 transition">
        <div class="absolute -top-2.5 right-3 bg-indigo-700 text-[7px] text-white font-bold px-2 py-0.5 rounded-full uppercase tracking-wider">Bulk</div>
        <div class="space-y-2.5">
          <span class="text-2xl">🏛️</span>
          <h4 class="text-base font-bold text-white uppercase">Institution</h4>
          <p class="text-[10px] text-indigo-200 leading-relaxed font-light">For schools, co-ops, and microschools deploying at scale.</p>
          <div class="py-1">
            <strong class="text-3xl font-extrabold text-indigo-400 font-mono">$12</strong>
            <span class="text-[10px] text-slate-300 ml-1 font-mono">/ Student / Month</span>
            <br />
            <strong class="text-xl font-extrabold text-indigo-400 font-mono">$144</strong>
            <span class="text-[10px] text-slate-300 ml-1 font-mono">/ Student / Year</span>
          </div>
          <ul class="text-[10px] text-slate-300 space-y-1.5 pt-2 border-t border-indigo-900/30 leading-relaxed">
            <li class="flex items-center gap-1.5"><span class="text-indigo-400 font-semibold">✓</span> Bulk student deployments</li>
            <li class="flex items-center gap-1.5"><span class="text-indigo-400 font-semibold">✓</span> Admin dashboard & roster tools</li>
            <li class="flex items-center gap-1.5"><span class="text-indigo-400 font-semibold">✓</span> Custom configuration & reports</li>
            <li class="flex items-center gap-1.5"><span class="text-indigo-400 font-semibold">✓</span> Priority support & onboarding</li>
          </ul>
        </div>
        <a href="#auth-section" onclick={() => setLandingAuthRole("institution")} class="block w-full py-2 bg-indigo-700 hover:bg-indigo-600 text-center text-[10px] font-extrabold uppercase rounded-xl text-white shadow-lg transition mt-2 no-underline">Configure — $12/stud</a>
      </div>
    </div>
  </div>

  <!-- Contact Section -->
  <div id="contact-section" transition:fly={{ y: 20, duration: 400 }} class="frosted-glass rounded-3xl p-6 sm:p-8 border border-blue-900/20 shadow-2xl relative">
    <div class="absolute right-4 top-4 text-blue-500 opacity-5 pointer-events-none"><Calculator class="w-36 h-36" /></div>
    <div class="relative z-10 space-y-8 animate-fade-in">
      <div class="space-y-2 text-center max-w-3xl mx-auto">
        <span class="text-xs uppercase tracking-widest font-mono text-blue-400 font-bold bg-blue-950 border border-blue-900/40 px-3 py-1 rounded">Institutional Portal & Rate Estimation</span>
        <h3 class="text-2xl sm:text-3xl font-extrabold text-white uppercase leading-tight">Display Plans for Schools & Custom Co-Ops</h3>
        <p class="text-slate-300 text-xs sm:text-sm font-light leading-relaxed">Water Classroom scales effortlessly. Our institutional pricing calculates at <strong class="text-blue-400">$12 per student per month</strong>.</p>
      </div>
      <div class="grid grid-cols-1 lg:grid-cols-12 gap-8 items-stretch pt-2">
        <div class="lg:col-span-7 bg-slate-950/60 p-6 rounded-2xl border border-blue-900/30 flex flex-col justify-between">
          <div class="space-y-4">
            <h4 class="text-md font-bold text-white uppercase tracking-wider flex items-center gap-2">
              <Calculator class="w-5 h-5 text-blue-400" /> School License Price Estimator
            </h4>
            <p class="text-xs text-slate-400 leading-relaxed font-light">Determine licensing parameters. Pricing computes flatly at USD $12 per student per month.</p>
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
              <div class="space-y-1">
                <label class="text-[10px] uppercase font-mono text-slate-400 block font-bold">Planned Students</label>
                <input type="number" value={appState.calcStudents} oninput={(e) => setCalcStudents(Math.max(1, parseInt((e.target as HTMLInputElement).value) || 0))}
                  class="w-full rounded-lg bg-slate-900 border border-slate-700 px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500 font-mono font-bold" />
              </div>
              <div class="space-y-1">
                <label class="text-[10px] uppercase font-mono text-slate-400 block font-bold">Billing Cycle</label>
                <div class="flex gap-2">
                  <button onclick={() => setCalcBilling("yearly")} class="flex-grow py-1.5 text-xs font-bold rounded-lg border transition {appState.calcBilling === 'yearly' ? 'bg-indigo-600 text-white border-indigo-500' : 'bg-slate-900 border-slate-700 text-slate-400'}">Yearly ($144/stud)</button>
                  <button onclick={() => setCalcBilling("monthly")} class="flex-grow py-1.5 text-xs font-bold rounded-lg border transition {appState.calcBilling === 'monthly' ? 'bg-indigo-600 text-white border-indigo-500' : 'bg-slate-900 border border-slate-700 text-slate-400'}">Monthly ($12/stud)</button>
                </div>
              </div>
            </div>
          </div>
          <div class="flex flex-col sm:flex-row justify-between items-center bg-indigo-950/20 p-4 rounded-xl border border-indigo-900/20 gap-4 mt-6">
            <div>
              <span class="text-[10px] uppercase font-mono text-indigo-300 font-bold block">Estimated Licensing Fee</span>
              <strong class="text-2xl font-extrabold text-[#818cf8] font-mono">${calculateInstitutionalBulkCost().toLocaleString()} USD</strong>
              <span class="text-[9px] text-[#a5b4fc] block font-mono">{appState.calcBilling === "yearly" ? "Billed annually" : "Billed monthly"} at flat $12 per student / month.</span>
            </div>
          </div>
        </div>
        <div class="lg:col-span-1"></div>
        <div class="lg:col-span-4 bg-[#0b1c36]/30 border border-blue-900/30 p-6 rounded-2xl flex flex-col justify-between">
          <form onsubmit={executeSendMessage} class="space-y-4">
            <h4 class="text-md font-bold text-white uppercase tracking-wider">💌 Contact Registrar Desk</h4>
            {#if appState.contactConfirmed}
              <div class="bg-emerald-950/50 border border-emerald-500/30 text-emerald-300 rounded-xl p-4 text-xs space-y-2 animate-fade-in leading-relaxed">
                <span class="font-bold text-white block text-[10px] uppercase font-mono tracking-wider">✓ Setup Request Sent</span>
                Your custom configuration request is saved. Support will respond within 12 hours.
              </div>
            {:else}
              <div class="space-y-1">
                <label class="text-[10px] uppercase font-mono text-slate-400 block font-bold">Representative Name</label>
                <input type="text" required placeholder="e.g. Principal Rogers" value={appState.contactName} oninput={(e) => setContactName((e.target as HTMLInputElement).value)}
                  class="w-full rounded-xl bg-slate-900 border border-slate-700 px-3.5 py-2 text-xs text-white" />
              </div>
              <div class="space-y-1">
                <label class="text-[10px] uppercase font-mono text-slate-400 block font-bold">Official School E-mail</label>
                <input type="email" required placeholder="e.g. rogers@charteracademy.org" value={appState.contactEmail} oninput={(e) => setContactEmail((e.target as HTMLInputElement).value)}
                  class="w-full rounded-xl bg-slate-900 border border-slate-700 px-3.5 py-2 text-xs text-white" />
              </div>
              <div class="space-y-1">
                <label class="text-[10px] uppercase font-mono text-slate-400 block font-bold">Requirements</label>
                <textarea required rows={3} placeholder="Detail your classroom volume, tracking rules, custom preferences..." value={appState.contactMsg} oninput={(e) => setContactMsg((e.target as HTMLTextAreaElement).value)}
                  class="w-full rounded-xl bg-slate-900 border border-slate-700 px-3.5 py-2 text-xs text-white focus:outline-none focus:border-blue-500 resize-none"></textarea>
              </div>
              {#if appState.contactErrorMsg}<div class="text-rose-400 text-[10px] p-2 bg-rose-950/50 border border-rose-900/50 rounded font-mono">⚠ {appState.contactErrorMsg}</div>{/if}
              <button type="submit" disabled={appState.isSendingContact}
                class="w-full py-2.5 rounded-xl font-extrabold text-xs uppercase tracking-wider transition block {appState.isSendingContact ? 'bg-indigo-900/50 text-indigo-300 cursor-not-allowed' : 'bg-indigo-600 hover:bg-indigo-500 text-white cursor-pointer'}">
                {appState.isSendingContact ? appState.sendingStatus || "Sending..." : "Submit Support Request"}
              </button>
            {/if}
          </form>
          <div class="border-t border-slate-800/80 pt-4 mt-4 text-[10px] text-slate-400 space-y-1">
            <p><strong>Email:</strong> stellar.foundation.us@gmail.com</p>
            <p><strong>Tel / WhatsApp:</strong> +55 81 99395-3560</p>
          </div>
        </div>
      </div>
    </div>
  </div>

  <!-- FAQ -->
  <div transition:fly={{ y: 20, duration: 400 }} class="space-y-4">
    <h3 class="text-xl font-extrabold text-white uppercase tracking-tight text-center">Frequently Asked Questions (FAQ)</h3>
    <p class="text-xs text-slate-400 text-center max-w-xl mx-auto -mt-2">Have questions about the platform? Read our FAQs below.</p>
    <div class="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
      {#each faqs as item, idx (idx)}
        <div class="bg-slate-950/40 rounded-xl border border-blue-900/20 overflow-hidden">
          <button onclick={() => setExpandedFaq(appState.expandedFaq === idx ? null : idx)}
            class="w-full px-5 py-4 flex justify-between items-center text-left hover:bg-blue-950/50 transition duration-200">
            <span class="font-bold text-white text-xs sm:text-sm leading-snug">{item.q}</span>
            <ChevronDown class="w-5 h-5 text-slate-400 transition-transform {appState.expandedFaq === idx ? 'transform rotate-180' : ''}" />
          </button>
          {#if appState.expandedFaq === idx}
            <div class="px-5 pb-4 text-[11px] sm:text-xs text-slate-300 leading-relaxed border-t border-blue-900/10 pt-3 bg-slate-900/30 font-light">{item.a}</div>
          {/if}
        </div>
      {/each}
    </div>
  </div>

  <!-- Footer -->
  <footer class="border-t border-blue-950/60 pt-12 pb-8 text-xs text-slate-400 space-y-10">
    <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-8">
      <div class="space-y-3 sm:col-span-2 lg:col-span-1">
        <div class="flex items-center gap-2">
          <div class="w-6 h-6 rounded bg-slate-900 border border-blue-500/20 flex items-center justify-center text-[10px] font-extrabold text-blue-400">W</div>
          <span class="font-extrabold text-white tracking-wider uppercase font-mono">WATER CLASSROOM</span>
        </div>
        <p class="text-[11px] text-slate-400 leading-relaxed font-light">The world-first open decentralized classroom registry. Delivering K-12 and undergraduate homeschool acceleration powered by Socratic AI.</p>
        <p class="text-[10px] text-slate-500 font-mono pt-1">LEDGER STATUS: COMPLIANT<br />SWISS BUREAU ID: CH-200.3.011</p>
      </div>
      <div class="space-y-3">
        <h5 class="font-bold text-white uppercase tracking-wider text-[11px] font-mono">CURRICULUM</h5>
        <ul class="space-y-2 text-[11px] text-slate-400 font-light">
          <li><a href="#auth-section" class="hover:text-blue-400 transition">U.S. Common Core</a></li>
          <li><a href="#auth-section" class="hover:text-blue-400 transition">UK GCSE & A-Level</a></li>
          <li><a href="#auth-section" class="hover:text-blue-400 transition">International Baccalaureate</a></li>
          <li><a href="#auth-section" class="hover:text-blue-400 transition">Swiss Maturité</a></li>
          <li><a href="#auth-section" class="hover:text-blue-400 transition">Socrates Creed</a></li>
        </ul>
      </div>
      <div class="space-y-3">
        <h5 class="font-bold text-white uppercase tracking-wider text-[11px] font-mono">SCHOOLS</h5>
        <ul class="space-y-2 text-[11px] text-slate-400 font-light">
          <li><a href="#contact-section" class="hover:text-indigo-400 transition">Configure School Plan</a></li>
          <li><a href="#contact-section" class="hover:text-indigo-400 transition">Rate Calculator</a></li>
          <li><a href="#auth-section" class="hover:text-indigo-400 transition">Access Key Deployments</a></li>
          <li><a href="#contact-section" class="hover:text-indigo-400 transition">Roster Registry Tools</a></li>
        </ul>
      </div>
      <div class="space-y-3">
        <h5 class="font-bold text-white uppercase tracking-wider text-[11px] font-mono">STELLARIUM FOUNDATION</h5>
        <p class="text-[11px] text-slate-400 leading-relaxed font-light">A registered non-profit promoting global knowledge access, decentralized ledgers, and free STEM sandboxes.</p>
        <p class="text-[10px] text-slate-500 font-mono">US Registry ID: DE-6421-ST<br />Swiss ID: CH-200.3.011.455-8</p>
      </div>
      <div class="space-y-3">
        <h5 class="font-bold text-white uppercase tracking-wider text-[11px] font-mono">SUPPORT</h5>
        <div class="text-[11px] text-slate-400 space-y-2 font-mono">
          <p>Email: stellar.foundation.us@gmail.com</p>
          <p class="text-[10px] leading-tight text-slate-500 font-light">Address: 50760-310, 223 - Brazil</p>
          <p class="text-[10px] text-slate-500">Tel / WhatsApp: +55 81 99395-3560</p>
          <p class="pt-2">
            <a href="https://www.stellarium.ddns-ip.net/" target="_blank" rel="noopener noreferrer"
              class="text-blue-400 hover:text-blue-300 underline transition">
              Stellarium ↗
            </a>
            <span class="mx-2 text-slate-600">|</span>
            <a href="https://water-enterprises-landing.onrender.com/" target="_blank" rel="noopener noreferrer"
              class="text-blue-400 hover:text-blue-300 underline transition">
              Water Enterprises ↗
            </a>
          </p>
        </div>
      </div>
    </div>
    <div class="border-t border-blue-950/40 pt-6 flex flex-col sm:flex-row justify-between items-center text-[10px] text-slate-500 gap-4">
      <p>© 2026 Water Classroom Global & Stellarium Foundation, Inc. All rights reserved.</p>
      <div class="flex gap-4 font-mono select-none">
        <span class="flex items-center gap-1"><span class="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span> SHA-256 LEDGER: [VERIFIED]</span>
        <span class="flex items-center gap-1"><span class="w-1.5 h-1.5 rounded-full bg-blue-500"></span> MONERO GATEWAY: [ON-LINE]</span>
      </div>
    </div>
  </footer>
</div>
