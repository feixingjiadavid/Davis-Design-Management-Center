const KEY = 'davis_video_a_history_archive_v1';

export async function prepareHistoryArchiveA(supabase) {
  if (!supabase) return { archivedProjects:0, archivedGroups:0, reload:false };
  const { data: sessionData } = await supabase.auth.getSession();
  const user = sessionData?.session?.user;
  if (!user?.id) return { archivedProjects:0, archivedGroups:0, reload:false };

  const marker = `${KEY}:${user.id}`;
  try {
    if (localStorage.getItem(marker) === 'done') {
      return { archivedProjects:0, archivedGroups:0, reload:false };
    }
  } catch {}

  const { data, error } = await supabase.rpc('archive_my_generated_video_history');
  if (error) {
    console.warn('[Davis Video A] history archive skipped', error);
    return { archivedProjects:0, archivedGroups:0, reload:false, error };
  }

  const archivedProjects = Number(data?.archived_projects || 0);
  const archivedGroups = Number(data?.archived_groups || 0);
  try { localStorage.setItem(marker, 'done'); } catch {}

  return {
    archivedProjects,
    archivedGroups,
    reload: archivedProjects > 0 || archivedGroups > 0,
  };
}
