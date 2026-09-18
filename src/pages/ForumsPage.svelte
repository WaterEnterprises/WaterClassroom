<script lang="ts">
  import { appState, setNewPostTitle, setNewPostContent, handleLoadCommunityPosts, handleCreateCommunityPost, handleLikeCommunityPost, handleDeleteCommunityPost, openThread, closeThread, handleSendReply, handleDeleteReply, handleLikeReply, fetchBrowseTree, fetchMyInstitution } from '../lib/store.svelte';
  import { Users, ThumbsUp, MessageSquare, Trash2, ShieldCheck, Layers, ArrowLeft, Send, RefreshCw } from 'lucide-svelte';
  import { fly, fade } from 'svelte/transition';

  const SUBJECTS = ["All", "Mathematics", "Science", "English", "Visual Arts", "Robotics", "Creed", "Human Dynamics"];

  // Selected grade channel: "grade-all" or "grade-<level>" (matches post grade_level).
  let selectedGrade = $state("grade-all");
  let selectedSubject = $state("All");

  const canModerate = $derived(appState.landingAuthRole === 'tutor' || appState.landingAuthRole === 'institution');

  // Browser shows only the tracks the user's school chose (all tracks when
  // the user has no school affiliation).
  const schoolTracks = $derived(
    appState.myInstitution
      ? (appState.browseTree as any[]).filter((t: any) => (t.institution_id || '') === appState.myInstitution!.id)
      : (appState.browseTree as any[])
  );

  // Useful-button pop animation: animate first, then register the like.
  let likingId = $state("");

  async function likeWithPop(postId: string) {
    if (likingId) return;
    likingId = postId;
    await new Promise((r) => setTimeout(r, 320));
    try { await handleLikeCommunityPost(postId); }
    finally { likingId = ""; }
  }

  let likingReplyId = $state("");

  async function likeReplyWithPop(replyId: string) {
    if (likingReplyId) return;
    likingReplyId = replyId;
    await new Promise((r) => setTimeout(r, 320));
    try { await handleLikeReply(replyId); }
    finally { likingReplyId = ""; }
  }

  const selectedGradeLabel = $derived.by(() => {
    if (selectedGrade === "grade-all") return "All Grades";
    const level = selectedGrade.replace('grade-', '');
    for (const t of appState.browseTree as any[]) {
      const g = (t.grades || []).find((gg: any) => String(gg.grade_level) === level);
      if (g) return `${t.name} • ${g.label}`;
    }
    return `Grade ${level}`;
  });

  function selectGrade(topicId: string) {
    selectedGrade = topicId;
    selectedSubject = "All";
    handleLoadCommunityPosts(topicId, "All");
  }

  async function moderateDelete(postId: string, title: string) {
    if (!confirm(`Delete post "${title}"? This cannot be undone.`)) return;
    await handleDeleteCommunityPost(postId);
  }

  $effect(() => {
    if (appState.isLoggedIn) {
      handleLoadCommunityPosts(selectedGrade, selectedSubject);
    }
  });

  $effect(() => {
    if (appState.isLoggedIn && appState.browseTree.length === 0 && !appState.isBrowseTreeLoading) {
      fetchBrowseTree();
    }
    if (appState.isLoggedIn && !appState.myInstitution) {
      fetchMyInstitution();
    }
  });
</script>

<style>
  @keyframes useful-pop {
    0% { transform: scale(1); }
    40% { transform: scale(1.6) rotate(-12deg); }
    70% { transform: scale(0.9); }
    100% { transform: scale(1); }
  }
  .useful-popping {
    animation: useful-pop 0.32s ease-in-out;
    color: #60a5fa;
  }
</style>

<div class="grid grid-cols-1 lg:grid-cols-3 gap-8 animate-fade-in text-white items-start">
  <!-- Left: tracks & grades browser -->
  <div class="lg:col-span-1 space-y-4">
    <div class="frosted-glass rounded-2xl p-5 border border-blue-950 space-y-3">
      <h4 class="font-extrabold text-white text-sm uppercase tracking-wide flex items-center gap-1.5">
        <Layers class="w-4 h-4 text-blue-400" /> Tracks & Grades
      </h4>
      {#if appState.myInstitution}
        <p class="text-[10px] text-slate-500 px-1">{appState.myInstitution.name} forums</p>
      {/if}
      <div class="space-y-1 max-h-[60vh] overflow-y-auto pr-1 custom-scrollbar">
        <button onclick={() => selectGrade("grade-all")}
          class="w-full text-left px-3 py-2 rounded-xl text-xs transition border {selectedGrade === 'grade-all' ? 'bg-blue-600/20 border-blue-500 text-white' : 'bg-slate-950/50 border-slate-800 text-slate-300 hover:border-slate-600'}">
          <span class="font-bold">All Grades</span>
          <span class="text-[9px] text-slate-500 block">Every forum thread</span>
        </button>
        {#each schoolTracks as t (t.id)}
          <div class="pt-1">
            <p class="text-[9px] uppercase font-mono tracking-widest text-slate-500 font-bold px-3 py-1">{t.name}</p>
            {#each t.grades as g (g.id)}
              {@const topicId = `grade-${g.grade_level}`}
              <button onclick={() => selectGrade(topicId)}
                class="w-full text-left px-3 py-2 rounded-xl text-xs transition border {selectedGrade === topicId ? 'bg-blue-600/20 border-blue-500 text-white' : 'bg-slate-950/50 border-slate-800 text-slate-300 hover:border-slate-600'}">
                <span class="font-bold block">{g.label}</span>
                <span class="text-[9px] text-slate-500">{(g.courses || []).length} courses • {(g.directLessons || []).length} lessons</span>
              </button>
            {/each}
          </div>
        {:else}
          <p class="text-[10px] text-slate-600 px-3">{appState.myInstitution ? 'Your school has no published tracks yet.' : 'No tracks published yet.'}</p>
        {/each}
      </div>
    </div>
  </div>

  <!-- Right: forums for the selected grade -->
  <div class="lg:col-span-2 space-y-4">
    <div class="flex justify-between items-center flex-wrap gap-2">
      <h3 class="font-extrabold text-white uppercase tracking-wider text-base">Community Discussions</h3>
      <span class="text-xs text-slate-400">{selectedGradeLabel} — {selectedSubject}</span>
    </div>

    <div class="flex flex-wrap gap-2">
      {#each SUBJECTS as subject}
        <button onclick={() => { selectedSubject = subject; handleLoadCommunityPosts(selectedGrade, subject); }}
          class="px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider transition border {selectedSubject === subject ? 'bg-blue-600 text-white border-blue-500' : 'bg-slate-900 border-slate-800 text-slate-400 hover:border-slate-600'}">
          {subject}
        </button>
      {/each}
    </div>

    <!-- Create Thread -->
    <div class="frosted-glass rounded-2xl p-5 border border-blue-950 space-y-4">
      <div class="space-y-1">
        <h4 class="font-extrabold text-white text-sm uppercase tracking-wide flex items-center gap-1"><Users class="w-4 h-4 text-blue-400 animate-pulse" /> Community Space</h4>
        <p class="text-[11px] text-slate-400">Posting to <strong class="text-slate-200">{selectedGradeLabel}</strong> — ask questions, share projects, and learn with peers.</p>
        {#if canModerate}
          <p class="text-[10px] text-amber-300 font-bold flex items-center gap-1"><ShieldCheck class="w-3.5 h-3.5" /> Moderator mode — you can remove posts.</p>
        {/if}
      </div>
      <form onsubmit={(e) => { e.preventDefault(); if (appState.newPostTitle.trim() && appState.newPostContent.trim()) handleCreateCommunityPost(appState.newPostTitle, appState.newPostContent, selectedSubject, selectedGrade.replace('grade-', '')); }} class="space-y-3">
        <div class="space-y-0.5">
          <label class="text-[9px] uppercase font-mono text-slate-400 block font-bold">Thread Title</label>
          <input type="text" required placeholder="Ask the community..." bind:value={appState.newPostTitle}
            class="w-full rounded-xl bg-slate-900 border border-slate-700/60 p-2 text-xs text-white focus:outline-none" />
        </div>
        <div class="space-y-0.5">
          <label class="text-[9px] uppercase font-mono text-slate-400 block font-bold">Body</label>
          <textarea required rows={3} placeholder="Share your question or project..." bind:value={appState.newPostContent}
            class="w-full rounded-xl bg-slate-900 border border-slate-700/60 p-2 text-xs text-white focus:outline-none"></textarea>
        </div>
        {#if appState.postSubmitError}
          <p class="text-[10px] text-red-400">{appState.postSubmitError}</p>
        {/if}
        {#if appState.postSubmitNotice}
          <p class="text-[10px] text-emerald-300">{appState.postSubmitNotice}</p>
        {/if}
        <button type="submit" disabled={appState.isSubmittingPost} class="w-full py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 font-bold text-xs uppercase tracking-wide transition text-white disabled:opacity-40">Post Question (+100 XP)</button>
      </form>
    </div>

    {#if appState.isSubmittingPost}
      <div class="text-center py-6 text-xs text-blue-400 animate-pulse">Publishing your post...</div>
    {/if}

    {#if appState.activeThread}
      {@const th = appState.activeThread}
      <div transition:fade={{ duration: 200 }} class="space-y-4">
        <button onclick={closeThread}
          class="px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-300 text-xs font-bold border border-slate-700 flex items-center gap-1.5 transition w-fit">
          <ArrowLeft class="w-3.5 h-3.5" /> Back to threads
        </button>
        <div class="frosted-glass-dark rounded-2xl p-5 border border-blue-900/40 space-y-3">
          <span class="px-2 py-0.5 rounded bg-slate-900 border border-blue-900/35 text-[9px] font-mono font-bold text-blue-400 uppercase w-fit">{th.category}</span>
          <h3 class="font-extrabold text-white text-lg tracking-tight leading-snug">{th.title}</h3>
          <div class="flex items-center gap-2">
            <div class="w-7 h-7 rounded-full bg-slate-900 border border-blue-500/30 flex items-center justify-center text-[10px] font-mono font-extrabold text-blue-400">{(th.author_name || 'S')[0]}</div>
            <div>
              <strong class="text-xs text-slate-200 block">{th.author_name || 'Student'}</strong>
              <span class="text-[9.5px] text-slate-500 font-light block">Level {th.author_level} • {String(th.created_at || '').slice(0, 10)}</span>
            </div>
          </div>
          <p class="text-slate-300 text-xs leading-relaxed font-light whitespace-pre-wrap">{th.content}</p>
          <div class="flex gap-4 pt-2 border-t border-slate-900/60 text-[11px] text-slate-400">
            <button onclick={() => likeWithPop(th.id)} disabled={!!likingId} class="flex items-center gap-1 hover:text-blue-400 transition disabled:opacity-60 {likingId === th.id ? 'useful-popping' : ''}"><ThumbsUp class="w-3.5 h-3.5" /> Useful ({th.likes})</button>
            {#if canModerate}
              <button onclick={() => moderateDelete(th.id, th.title)} class="flex items-center gap-1 hover:text-red-400 transition ml-auto" title="Remove thread (moderator)"><Trash2 class="w-3.5 h-3.5" /> Remove</button>
            {/if}
          </div>
        </div>

        <p class="text-[10px] uppercase font-mono tracking-widest text-slate-400 font-bold px-1">Replies ({appState.threadReplies.length})</p>
        {#if appState.isThreadLoading}
          <div class="text-center py-6 text-xs text-blue-400 animate-pulse flex items-center justify-center gap-2"><RefreshCw class="w-4 h-4 animate-spin" /> Loading replies…</div>
        {:else}
          <div class="space-y-2">
            {#each appState.threadReplies as reply (reply.id)}
              <div class="rounded-2xl p-4 bg-slate-950/60 border border-slate-800 space-y-2">
                <div class="flex items-center justify-between gap-2">
                  <div class="flex items-center gap-2">
                    <div class="w-6 h-6 rounded-full bg-slate-900 border border-slate-700 flex items-center justify-center text-[9px] font-mono font-extrabold text-slate-400">{(reply.author_name || 'S')[0]}</div>
                    <div>
                      <strong class="text-[11px] text-slate-200 block">{reply.author_name}</strong>
                      <span class="text-[9px] text-slate-500 block">Level {reply.author_level} • {String(reply.created_at || '').slice(0, 10)}</span>
                    </div>
                  </div>
                  {#if canModerate || reply.author_name === appState.studentName}
                    <button onclick={() => handleDeleteReply(reply.id)} class="p-1.5 rounded-lg text-slate-600 hover:text-red-400 transition" title="Delete reply"><Trash2 class="w-3.5 h-3.5" /></button>
                  {/if}
                </div>
                <p class="text-xs text-slate-300 leading-relaxed font-light whitespace-pre-wrap">{reply.content}</p>
                <div class="flex gap-4 pt-1 text-[10px] text-slate-500">
                  <button onclick={() => likeReplyWithPop(reply.id)} disabled={!!likingReplyId} class="flex items-center gap-1 hover:text-blue-400 transition disabled:opacity-60 {likingReplyId === reply.id ? 'useful-popping' : ''}"><ThumbsUp class="w-3 h-3" /> Useful ({reply.likes ?? 0})</button>
                </div>
              </div>
            {:else}
              <p class="text-[11px] text-slate-600 px-1">No replies yet — start the discussion below.</p>
            {/each}
          </div>
        {/if}

        {#if appState.threadError}<p class="text-[10px] text-red-400 font-bold">{appState.threadError}</p>{/if}
        <div class="frosted-glass rounded-2xl p-4 border border-blue-950 space-y-3">
          <label class="text-[9px] uppercase font-mono text-slate-400 block font-bold">Post a reply</label>
          <textarea rows={3} placeholder="Share your thoughts on this thread..." bind:value={appState.newReplyContent}
            class="w-full rounded-xl bg-slate-900 border border-slate-700/60 p-2.5 text-xs text-white focus:outline-none focus:border-blue-500 resize-y"></textarea>
          <button onclick={handleSendReply} disabled={appState.isSendingReply || !appState.newReplyContent.trim()}
            class="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white text-xs font-bold uppercase tracking-wider transition flex items-center gap-1.5">
            {#if appState.isSendingReply}<RefreshCw class="w-3.5 h-3.5 animate-spin" />{:else}<Send class="w-3.5 h-3.5" />{/if}
            {appState.isSendingReply ? 'Posting…' : 'Post Reply'}
          </button>
        </div>
      </div>
    {:else}
    <div class="space-y-3">
      {#each appState.communityPosts as post (post.id)}
        <div role="button" tabindex="0" onclick={() => openThread(post)} onkeydown={(e) => { if (e.key === 'Enter') openThread(post); }}
          transition:fly={{ y: 15, duration: 300 }} class="frosted-glass-dark rounded-2xl p-5 border border-slate-800 space-y-3 relative overflow-hidden transition-all duration-300 hover:border-blue-500/40 cursor-pointer">
          <span class="absolute top-2 right-2 px-2 py-0.5 rounded bg-slate-900 border border-blue-900/35 text-[9px] font-mono font-bold text-blue-400 uppercase">{post.category}</span>
          <div class="flex items-center gap-2">
            <div class="w-7 h-7 rounded-full bg-slate-900 border border-blue-500/30 flex items-center justify-center text-[10px] font-mono font-extrabold text-blue-400">{(post.author_name || 'S')[0]}</div>
            <div>
              <strong class="text-xs text-slate-200 block">{post.author_name || 'Student'}</strong>
              <span class="text-[9.5px] text-slate-500 font-light block">Level {post.author_level} student</span>
            </div>
          </div>
          <button onclick={() => openThread(post)} class="block w-full text-left font-extrabold text-white text-sm sm:text-base tracking-tight leading-snug pt-1 hover:text-blue-300 transition cursor-pointer">{post.title}</button>
          <p class="text-slate-300 text-xs leading-relaxed font-light line-clamp-2">{post.content}</p>
          <div class="flex gap-4 pt-2 border-t border-slate-900/60 text-[11px] text-slate-400">
            <button onclick={(e) => { e.stopPropagation(); likeWithPop(post.id); }} disabled={!!likingId} class="flex items-center gap-1 hover:text-blue-400 transition disabled:opacity-60 {likingId === post.id ? 'useful-popping' : ''}"><ThumbsUp class="w-3.5 h-3.5" /> Useful ({post.likes})</button>
            <button onclick={(e) => { e.stopPropagation(); openThread(post); }} class="flex items-center gap-1 hover:text-blue-400 transition"><MessageSquare class="w-3.5 h-3.5" /> Reply ({post.replies})</button>
            {#if canModerate}
              <button onclick={(e) => { e.stopPropagation(); moderateDelete(post.id, post.title); }} class="flex items-center gap-1 hover:text-red-400 transition ml-auto" title="Remove post (moderator)"><Trash2 class="w-3.5 h-3.5" /> Remove</button>
            {/if}
          </div>
        </div>
      {/each}
      {#if appState.communityPosts.length === 0 && !appState.isSubmittingPost}
        <div class="text-center py-12 text-xs text-slate-600">
          <Users class="w-8 h-8 mx-auto mb-2 text-slate-800" />
          <p>No posts yet for {selectedGradeLabel}. Be the first to ask a question!</p>
        </div>
      {/if}
    </div>
    {/if}
  </div>
</div>
