<script lang="ts">
  import { appState, setIsLoggedIn, handleUpdateProfile, fetchSeatPurchases } from '../lib/store.svelte';
  import { User, Users, Mail, Globe, GraduationCap, CreditCard, Shield, LogOut, ChevronRight, Check, Calendar, BookOpen, Building, Clock, Key, Trash2, Bell, Camera, Save } from 'lucide-svelte';

  const isInstitution = $derived(appState.landingAuthRole === 'institution');

  let profileImage = $state<string | null>(null);
  let fileInput: HTMLInputElement;

  function handleImageUpload(e: Event) {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      profileImage = reader.result as string;
      try { localStorage.setItem('wc_profile_image', profileImage); } catch {}
    };
    reader.readAsDataURL(file);
  }

  function loadProfileImage() {
    try {
      const saved = localStorage.getItem('wc_profile_image');
      if (saved) profileImage = saved;
    } catch {}
  }

  loadProfileImage();

  const accountTypeLabel = $derived(() => {
    switch (appState.landingAuthRole) {
      case 'water-student': return 'Water Student';
      case 'independent-student': return 'Independent Student';
      case 'school-student': return 'School Student';
      case 'institution': return 'Institution';
      default: return 'Student';
    }
  });

  const planLabel = $derived(() => {
    switch (appState.landingAuthRole) {
      case 'water-student': return appState.studentBillingCycle === 'yearly' ? '$190/yr' : '$19/mo';
      case 'independent-student': return appState.studentBillingCycle === 'yearly' ? '$150/yr' : '$15/mo';
      case 'school-student': return appState.studentBillingCycle === 'yearly' ? '$120/yr' : '$12/mo';
      case 'institution': return '$12/student/mo';
      default: return 'Free';
    }
  });

  let activeSection = $state<'overview' | 'payments' | 'settings'>('overview');
  let seatsLoaded = $state(false);

  const monthName = $derived(
    appState.seatMonth.month >= 1 && appState.seatMonth.month <= 12
      ? new Date(appState.seatMonth.year, appState.seatMonth.month - 1, 1).toLocaleString('default', { month: 'long' })
      : 'This month'
  );

  $effect(() => {
    if (isInstitution && activeSection === 'payments' && !seatsLoaded && !appState.isSeatPurchasesLoading) {
      seatsLoaded = true;
      fetchSeatPurchases();
    }
  });
  let showPasswordChange = $state(false);
  let currentPassword = $state('');
  let newPassword = $state('');
  let confirmNewPassword = $state('');
  let passwordMessage = $state('');
  let passwordError = $state('');

  function handlePasswordChange() {
    passwordMessage = '';
    passwordError = '';
    if (!currentPassword || !newPassword || !confirmNewPassword) {
      passwordError = 'All fields are required.';
      return;
    }
    if (newPassword.length < 6) {
      passwordError = 'New password must be at least 6 characters.';
      return;
    }
    if (newPassword !== confirmNewPassword) {
      passwordError = 'New passwords do not match.';
      return;
    }
    passwordMessage = 'Password updated successfully. (Simulated — connect to backend)';
    currentPassword = '';
    newPassword = '';
    confirmNewPassword = '';
    setTimeout(() => { passwordMessage = ''; showPasswordChange = false; }, 3000);
  }

  function handleLogout() {
    setIsLoggedIn(false);
  }
</script>

<div class="space-y-8 animate-fade-in text-white">
  <!-- Profile Header -->
  <div class="frosted-glass rounded-3xl p-6 sm:p-8 border border-blue-950 flex flex-col sm:flex-row justify-between items-center gap-6 relative overflow-hidden">
    <div class="absolute right-0 top-0 w-32 h-32 bg-blue-500/5 rounded-full blur-2xl"></div>
    <div class="flex items-center gap-4 relative z-10">
      <button onclick={() => fileInput?.click()} class="relative group cursor-pointer">
        {#if profileImage}
          <img src={profileImage} alt="Profile" class="w-16 h-16 rounded-2xl object-cover border-2 border-blue-500/30 shadow-lg" />
        {:else}
          <div class="w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-600 to-indigo-600 flex items-center justify-center text-white text-2xl font-extrabold shadow-lg shadow-blue-500/20">
            {appState.studentName.charAt(0).toUpperCase()}
          </div>
        {/if}
        <div class="absolute inset-0 rounded-2xl bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition">
          <Camera class="w-5 h-5 text-white" />
        </div>
      </button>
      <input bind:this={fileInput} type="file" accept="image/*" onchange={handleImageUpload} class="hidden" />
      <div class="space-y-1">
        <h2 class="text-2xl font-extrabold text-white tracking-tight">{appState.studentName}</h2>
        <p class="text-xs text-slate-400 font-mono">{appState.loginEmail}</p>
        <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider {appState.isUserActivated ? 'bg-emerald-950 text-emerald-400 border border-emerald-800' : 'bg-amber-950 text-amber-400 border border-amber-800'}">
          {appState.isUserActivated ? '✓ Active' : '⏳ Pending'}
        </span>
      </div>
    </div>
    <div class="flex gap-3 relative z-10">
      <a href="#contact-section" class="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold transition">Upgrade Plan</a>
      <button onclick={handleLogout} class="px-4 py-2 rounded-xl bg-red-950/50 hover:bg-red-900/60 text-red-300 text-xs font-bold transition border border-red-500/20 flex items-center gap-1.5">
        <LogOut class="w-3.5 h-3.5" /> Logout
      </button>
    </div>
  </div>

  <!-- Navigation Tabs -->
  <div class="flex gap-1.5 p-1 bg-slate-950/80 rounded-xl border border-slate-800">
    {#each [{ key: 'overview' as const, label: 'Profile', icon: User }, { key: 'payments' as const, label: 'Payments', icon: CreditCard }, { key: 'settings' as const, label: 'Settings', icon: Shield }] as tab}
      <button onclick={() => activeSection = tab.key} class="flex items-center gap-1.5 px-4 py-2 text-[10px] font-bold rounded-lg uppercase tracking-wider transition {activeSection === tab.key ? 'bg-blue-600 text-white shadow-md' : 'text-slate-400 hover:text-slate-200'}">
        <tab.icon class="w-3.5 h-3.5" /> {tab.label}
      </button>
    {/each}
  </div>

  <!-- Overview Section -->
  {#if activeSection === 'overview'}
    <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <!-- Account Info -->
      <div class="frosted-glass rounded-2xl p-6 border border-blue-900/30 space-y-4">
        <h3 class="text-sm font-bold text-white uppercase tracking-wide flex items-center gap-2"><User class="w-4 h-4 text-blue-400" /> Account Information</h3>
        <div class="space-y-3">
          <div class="flex justify-between items-center p-3 bg-slate-950/50 rounded-xl">
            <span class="text-[10px] uppercase font-mono text-slate-400 font-bold">Full Name</span>
            <span class="text-xs text-white font-bold">{appState.studentName}</span>
          </div>
          <div class="flex justify-between items-center p-3 bg-slate-950/50 rounded-xl">
            <span class="text-[10px] uppercase font-mono text-slate-400 font-bold">Email</span>
            <span class="text-xs text-white font-bold font-mono">{appState.loginEmail}</span>
          </div>
          <div class="flex justify-between items-center p-3 bg-slate-950/50 rounded-xl">
            <span class="text-[10px] uppercase font-mono text-slate-400 font-bold">Account Type</span>
            <span class="text-xs text-white font-bold">{accountTypeLabel()}</span>
          </div>
          <div class="flex justify-between items-center p-3 bg-slate-950/50 rounded-xl">
            <span class="text-[10px] uppercase font-mono text-slate-400 font-bold">Academic Track</span>
            <span class="text-xs text-white font-bold">{appState.onboardingCurriculum}</span>
          </div>
      </div>
    </div>

    <!-- Progress Summary -->
    <div class="frosted-glass rounded-2xl p-6 border border-blue-900/30 space-y-4">
      <h3 class="text-sm font-bold text-white uppercase tracking-wide flex items-center gap-2"><BookOpen class="w-4 h-4 text-amber-400" /> Learning Progress</h3>
      <div class="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div class="bg-slate-950/50 p-4 rounded-xl text-center space-y-1">
          <strong class="text-2xl font-extrabold text-blue-400">{appState.progress.completedLessons.length}</strong>
          <span class="text-[9px] text-slate-400 font-mono uppercase">Lessons Done</span>
        </div>
        <div class="bg-slate-950/50 p-4 rounded-xl text-center space-y-1">
          <strong class="text-2xl font-extrabold text-emerald-400">{appState.progress.unlockedBadges.length}</strong>
          <span class="text-[9px] text-slate-400 font-mono uppercase">Badges Earned</span>
        </div>
        <div class="bg-slate-950/50 p-4 rounded-xl text-center space-y-1">
          <strong class="text-2xl font-extrabold text-amber-400">{appState.verifiedExamsList.length}</strong>
          <span class="text-[9px] text-slate-400 font-mono uppercase">Exams Passed</span>
        </div>
        <div class="bg-slate-950/50 p-4 rounded-xl text-center space-y-1">
          <strong class="text-2xl font-extrabold text-purple-400">{appState.tasks.filter(t => t.status === 'Completed').length}</strong>
          <span class="text-[9px] text-slate-400 font-mono uppercase">Tasks Done</span>
        </div>
      </div>
    </div>
    </div>
  {/if}

  <!-- Payments Section -->
  {#if activeSection === 'payments'}
    {#if isInstitution}
      <!-- Spots paid for this month -->
      <div class="frosted-glass rounded-2xl p-6 border border-emerald-900/30 space-y-4 mb-6">
        <h3 class="text-sm font-bold text-white uppercase tracking-wide flex items-center gap-2"><Users class="w-4 h-4 text-emerald-400" /> Spots Paid — {monthName}</h3>
        {#if appState.isSeatPurchasesLoading && appState.seatPurchases.length === 0}
          <p class="text-xs text-slate-400">Loading spot purchases…</p>
        {:else}
          <div class="grid grid-cols-2 sm:grid-cols-3 gap-4">
            <div class="bg-slate-950/50 p-4 rounded-xl text-center space-y-1">
              <strong class="text-2xl font-extrabold text-emerald-400 font-mono">{appState.seatMonth.spots}</strong>
              <span class="text-[9px] text-slate-400 font-mono uppercase block">Spots paid</span>
            </div>
            <div class="bg-slate-950/50 p-4 rounded-xl text-center space-y-1">
              <strong class="text-2xl font-extrabold text-white font-mono">${(appState.seatMonth.amount_cents / 100).toLocaleString()}</strong>
              <span class="text-[9px] text-slate-400 font-mono uppercase block">Charged</span>
            </div>
            <div class="bg-slate-950/50 p-4 rounded-xl text-center space-y-1">
              <strong class="text-2xl font-extrabold text-blue-400 font-mono">{appState.institutionSeats.paid}</strong>
              <span class="text-[9px] text-slate-400 font-mono uppercase block">Total spots</span>
            </div>
          </div>
          {#if appState.seatPurchases.length > 0}
            <div class="space-y-2">
              {#each appState.seatPurchases.slice(0, 10) as p (p.id)}
                <div class="p-3 bg-slate-950/50 rounded-xl flex justify-between items-center">
                  <div>
                    <p class="text-xs text-white font-bold">{p.spots} spot{p.spots === 1 ? '' : 's'} <span class="text-slate-500 font-normal">• {p.billing_cycle === 'yearly' ? 'Yearly' : 'Monthly'}</span></p>
                    <p class="text-[9px] text-slate-500 font-mono">{String(p.created_at || '').slice(0, 10)}</p>
                  </div>
                  <p class="text-xs text-white font-bold font-mono">${(Number(p.amount_cents || 0) / 100).toLocaleString()}</p>
                </div>
              {/each}
            </div>
          {:else}
            <p class="text-[11px] text-slate-600">No spot purchases yet — buy spots in School → Settings.</p>
          {/if}
        {/if}
      </div>
    {/if}
    <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <!-- Current Plan -->
      <div class="frosted-glass rounded-2xl p-6 border border-blue-900/30 space-y-4">
        <h3 class="text-sm font-bold text-white uppercase tracking-wide flex items-center gap-2"><CreditCard class="w-4 h-4 text-blue-400" /> Current Plan</h3>
        <div class="bg-slate-950/50 p-5 rounded-xl space-y-3">
          <div class="flex justify-between items-center">
            <span class="text-xs text-slate-400 font-bold uppercase">Plan</span>
            <span class="text-sm text-white font-extrabold">{accountTypeLabel()}</span>
          </div>
          <div class="flex justify-between items-center">
            <span class="text-xs text-slate-400 font-bold uppercase">Price</span>
            <span class="text-lg text-blue-400 font-extrabold font-mono">{planLabel()}</span>
          </div>
          <div class="flex justify-between items-center">
            <span class="text-xs text-slate-400 font-bold uppercase">Billing Cycle</span>
            <span class="text-xs text-white font-bold capitalize">{appState.studentBillingCycle}</span>
          </div>
          <div class="flex justify-between items-center">
            <span class="text-xs text-slate-400 font-bold uppercase">Status</span>
            <span class="text-xs font-bold {appState.isUserActivated ? 'text-emerald-400' : 'text-amber-400'}">{appState.isUserActivated ? 'Active' : 'Pending Activation'}</span>
          </div>
        </div>
        <button class="w-full py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs uppercase tracking-wider transition">Manage Subscription</button>
      </div>

      <!-- Payment History -->
      <div class="frosted-glass rounded-2xl p-6 border border-blue-900/30 space-y-4">
        <h3 class="text-sm font-bold text-white uppercase tracking-wide flex items-center gap-2"><Clock class="w-4 h-4 text-emerald-400" /> Payment History</h3>
        <div class="space-y-3">
          <div class="p-3 bg-slate-950/50 rounded-xl flex justify-between items-center">
            <div>
              <p class="text-xs text-white font-bold">Registration</p>
              <p class="text-[9px] text-slate-500 font-mono">{accountTypeLabel()} Plan</p>
            </div>
            <div class="text-right">
              <p class="text-xs text-white font-bold font-mono">{planLabel()}</p>
              <p class="text-[9px] text-emerald-400 font-mono">Paid</p>
            </div>
          </div>
          {#if appState.verifiedExamsList.length > 0}
            {#each appState.verifiedExamsList.slice(0, 3) as exam (exam.id)}
              <div class="p-3 bg-slate-950/50 rounded-xl flex justify-between items-center">
                <div>
                  <p class="text-xs text-white font-bold">Exam: {exam.lessonTitle}</p>
                  <p class="text-[9px] text-slate-500 font-mono">{exam.timestamp}</p>
                </div>
                <span class="text-[9px] text-emerald-400 font-bold font-mono bg-emerald-950 px-2 py-0.5 rounded">{exam.score}</span>
              </div>
            {/each}
          {/if}
        </div>
        <div class="text-center pt-2 border-t border-slate-800">
          <p class="text-[9px] text-slate-500">All transactions are processed securely via Stripe.</p>
        </div>
      </div>
    </div>
  {/if}

  <!-- Settings Section -->
  {#if activeSection === 'settings'}
    <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <!-- Security -->
      <div class="frosted-glass rounded-2xl p-6 border border-blue-900/30 space-y-4">
        <h3 class="text-sm font-bold text-white uppercase tracking-wide flex items-center gap-2"><Key class="w-4 h-4 text-amber-400" /> Security</h3>
        {#if !showPasswordChange}
          <button onclick={() => showPasswordChange = true} class="w-full p-4 bg-slate-950/50 rounded-xl border border-slate-800 hover:border-blue-500/50 transition text-left space-y-1">
            <span class="text-xs text-white font-bold block">Change Password</span>
            <span class="text-[9px] text-slate-500">Update your account password</span>
          </button>
        {:else}
          <div class="space-y-3 bg-slate-950/50 p-4 rounded-xl border border-slate-800">
            <div class="space-y-1">
              <label class="text-[10px] uppercase font-mono text-slate-400 font-bold block">Current Password</label>
              <input type="password" bind:value={currentPassword} class="w-full rounded-lg bg-slate-900 border border-slate-700 px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500" />
            </div>
            <div class="space-y-1">
              <label class="text-[10px] uppercase font-mono text-slate-400 font-bold block">New Password</label>
              <input type="password" bind:value={newPassword} class="w-full rounded-lg bg-slate-900 border border-slate-700 px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500" />
            </div>
            <div class="space-y-1">
              <label class="text-[10px] uppercase font-mono text-slate-400 font-bold block">Confirm New Password</label>
              <input type="password" bind:value={confirmNewPassword} class="w-full rounded-lg bg-slate-900 border border-slate-700 px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500" />
            </div>
            {#if passwordError}
              <p class="text-rose-400 text-[10px] font-mono">{passwordError}</p>
            {/if}
            {#if passwordMessage}
              <p class="text-emerald-400 text-[10px] font-mono">{passwordMessage}</p>
            {/if}
            <div class="flex gap-2">
              <button onclick={handlePasswordChange} class="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-[10px] font-bold rounded-lg uppercase transition">Save</button>
              <button onclick={() => { showPasswordChange = false; passwordError = ''; passwordMessage = ''; }} class="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-[10px] font-bold rounded-lg uppercase transition">Cancel</button>
            </div>
          </div>
        {/if}
        <button class="w-full p-4 bg-slate-950/50 rounded-xl border border-slate-800 hover:border-blue-500/50 transition text-left space-y-1">
          <span class="text-xs text-white font-bold block flex items-center gap-2"><Shield class="w-3.5 h-3.5 text-emerald-400" /> Two-Factor Authentication</span>
          <span class="text-[9px] text-slate-500">Add an extra layer of security to your account</span>
        </button>

        <div class="frosted-glass rounded-2xl p-6 border border-blue-900/30 space-y-4">
          <h3 class="text-sm font-bold text-white uppercase tracking-wide flex items-center gap-2"><User class="w-4 h-4 text-blue-400" /> Edit Profile</h3>
          <div class="space-y-3">
            <div class="space-y-1">
              <label class="text-[10px] uppercase font-mono text-slate-400 font-bold block">Display Name</label>
              <input type="text" bind:value={appState.studentName} class="w-full rounded-lg bg-slate-900 border border-slate-700 px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500" />
            </div>
            <div class="space-y-1">
              <label class="text-[10px] uppercase font-mono text-slate-400 font-bold block">Grade Level</label>
              <select bind:value={appState.studentGradeLevelId} class="w-full rounded-lg bg-slate-900 border border-slate-700 px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500">
                <option value="">Select Grade</option>
                {#each ['K', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12', 'UG'] as g}
                  <option value={g}>{g === 'UG' ? 'Undergraduate' : `Grade ${g}`}</option>
                {/each}
              </select>
            </div>
            <div class="space-y-1">
              <label class="text-[10px] uppercase font-mono text-slate-400 font-bold block">Country</label>
              <input type="text" bind:value={appState.studentCountry} class="w-full rounded-lg bg-slate-900 border border-slate-700 px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500" />
            </div>
            <button onclick={() => handleUpdateProfile({ name: appState.studentName, gradeLevel: appState.studentGradeLevelId, country: appState.studentCountry })} class="w-full py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold uppercase tracking-wider transition flex items-center justify-center gap-2">
              <Save class="w-3.5 h-3.5" /> Save Changes
            </button>
          </div>
        </div>
      </div>

      <!-- Notifications & Danger Zone -->
      <div class="space-y-6">
        <div class="frosted-glass rounded-2xl p-6 border border-blue-900/30 space-y-4">
          <h3 class="text-sm font-bold text-white uppercase tracking-wide flex items-center gap-2"><Bell class="w-4 h-4 text-purple-400" /> Notifications</h3>
          <div class="space-y-2">
            {#each ['Email notifications for new lessons', 'Weekly progress summary', 'Forum reply notifications', 'Task assignment alerts'] as pref}
              <div class="flex items-center justify-between p-3 bg-slate-950/50 rounded-xl">
                <span class="text-xs text-white">{pref}</span>
                <div class="w-10 h-5 bg-blue-600 rounded-full relative cursor-pointer">
                  <div class="absolute right-0.5 top-0.5 w-4 h-4 bg-white rounded-full shadow"></div>
                </div>
              </div>
            {/each}
          </div>
        </div>

        <div class="frosted-glass rounded-2xl p-6 border border-rose-500/20 space-y-4">
          <h3 class="text-sm font-bold text-rose-400 uppercase tracking-wide flex items-center gap-2"><Trash2 class="w-4 h-4" /> Danger Zone</h3>
          <p class="text-[10px] text-slate-400">Permanently delete your account and all associated data. This action cannot be undone.</p>
          <button class="px-4 py-2 bg-rose-950/50 hover:bg-rose-900/60 text-rose-300 text-[10px] font-bold rounded-lg uppercase transition border border-rose-500/20">Delete Account</button>
        </div>
      </div>
    </div>
  {/if}
</div>
