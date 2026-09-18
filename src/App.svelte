<script>
  import { appState, navigateTo } from './lib/store.svelte';
  import Header from './components/layout/Header.svelte';
  import OnboardingDialog from './components/layout/OnboardingDialog.svelte';
  import DonateModal from './components/modals/DonateModal.svelte';
  import ErrorBoundary from './components/ErrorBoundary.svelte';
  import LandingPage from './pages/LandingPage.svelte';
  import DashboardPage from './pages/DashboardPage.svelte';
  import SchoolDashboardPage from './school/SchoolDashboardPage.svelte';
  import AcademyPage from './pages/AcademyPage.svelte';
  import AITutorPage from './pages/AITutorPage.svelte';
  import TasksPage from './pages/TasksPage.svelte';
  import ForumsPage from './pages/ForumsPage.svelte';
  import ProfilePage from './pages/ProfilePage.svelte';
  import ExamsPage from './pages/ExamsPage.svelte';
  import StudentsPage from './pages/StudentsPage.svelte';
  import MessagesPage from './pages/MessagesPage.svelte';
  import StudioPage from './pages/StudioPage.svelte';
  import { BookOpen, ClipboardList, MessageSquare, LayoutDashboard, Building, User, Shield, GraduationCap, Users, Mail } from 'lucide-svelte';
  import { fade, scale } from 'svelte/transition';

  const isInstitution = $derived(appState.landingAuthRole === 'institution');

  const navTabs = $derived(isInstitution
    ? [
        { key: 'dashboard', label: 'School', icon: Building },
        { key: 'studio', label: 'Studio', icon: GraduationCap },
        { key: 'academy', label: 'Academy', icon: BookOpen },
        { key: 'tutor', label: 'Tutors', icon: GraduationCap },
        { key: 'tasks', label: 'Tasks', icon: ClipboardList },
        { key: 'exams', label: 'Students', icon: Users },
        { key: 'collaborate', label: 'Forums', icon: MessageSquare },
        { key: 'messages', label: 'Messages', icon: Mail },
      ]
    : [
        { key: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
        { key: 'academy', label: 'Academy', icon: BookOpen },
        { key: 'tutor', label: 'Tutors', icon: GraduationCap },
        { key: 'tasks', label: 'Tasks', icon: ClipboardList },
        { key: 'exams', label: 'Exams', icon: Shield },
        { key: 'collaborate', label: 'Forums', icon: MessageSquare },
        { key: 'messages', label: 'Messages', icon: Mail },
      ]);
</script>

<div class="min-h-screen bg-[#030712] deep-space-bg flex flex-col pb-24 md:pb-6 text-slate-100 antialiased font-sans transition-all duration-500">
  <Header />
  <main class="flex-grow w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
    {#if !appState.isLoggedIn}
      <LandingPage />
    {:else}
      <OnboardingDialog />
      <DonateModal />
      <!-- All pages stay mounted (hidden, not destroyed) so tab switches
           preserve each screen's state: forms, chat, drill-downs, scroll. -->
      <ErrorBoundary>
        <div transition:fade={{ duration: 200 }} class="animate-fade-in" class:hidden={appState.activeTab !== 'dashboard'}>
            {#if isInstitution}
              <SchoolDashboardPage />
            {:else}
              <DashboardPage />
            {/if}
        </div>
        <div class:hidden={appState.activeTab !== 'academy'}>
          <AcademyPage />
        </div>
        <div class:hidden={appState.activeTab !== 'tutor'}>
          <AITutorPage />
        </div>
        <div class:hidden={appState.activeTab !== 'tasks'}>
          <TasksPage />
        </div>
        <div class:hidden={appState.activeTab !== 'exams'}>
          {#if isInstitution}
            <StudentsPage />
          {:else}
            <ExamsPage />
          {/if}
        </div>
        <div class:hidden={appState.activeTab !== 'collaborate'}>
          <ForumsPage />
        </div>
        <div class:hidden={appState.activeTab !== 'messages'}>
          <MessagesPage />
        </div>
        {#if isInstitution}
          <div class:hidden={appState.activeTab !== 'studio'}>
            <StudioPage />
          </div>
        {/if}
        <div class:hidden={appState.activeTab !== 'profile'}>
          <ProfilePage />
        </div>
      </ErrorBoundary>
    {/if}
  </main>

  {#if appState.isLoggedIn}
    <nav class="fixed bottom-0 left-0 right-0 z-30 bg-[#060b18]/95 backdrop-blur-lg border-t border-blue-950/60 safe-area-bottom">
      <div class="max-w-2xl mx-auto flex justify-around items-center py-2 px-1">
        {#each navTabs as tab}
          {@const Icon = tab.icon}
          {@const isActive = appState.activeTab === tab.key}
          <button
            onclick={() => navigateTo(tab.key)}
            class="relative flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-lg transition-all duration-200 {isActive ? 'text-blue-400 scale-105' : 'text-slate-500 hover:text-slate-300'}"
          >
            <Icon class="w-5 h-5" />
            {#if tab.key === 'messages' && appState.dmUnreadTotal > 0}
              <span class="absolute top-0.5 right-1 min-w-4 h-4 px-1 rounded-full bg-blue-600 text-white text-[8px] font-extrabold flex items-center justify-center">{appState.dmUnreadTotal > 99 ? '99+' : appState.dmUnreadTotal}</span>
            {/if}
            <span class="text-[9px] font-bold uppercase tracking-wider">{tab.label}</span>
            {#if isActive}
              <span transition:scale={{ duration: 120 }} class="w-4 h-0.5 bg-blue-500 rounded-full mt-0.5"></span>
            {/if}
          </button>
        {/each}
      </div>
    </nav>
  {/if}
</div>
