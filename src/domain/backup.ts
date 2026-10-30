// When the app asks for a backup. Data lives only in the browser, so a regular backup file is the only protection against loss.

export const BACKUP_DAYS = 7;

/**
 * Days since the last backup when a backup is due, else undefined.
 * Due when there is at least one finished workout and no backup, or the last backup is older than `days`.
 * No backup at all gives Infinity.
 */
export function backupDue(lastBackupAt: string | undefined, finishedWorkouts: number, now = new Date(), days = BACKUP_DAYS): number | undefined {
  if (finishedWorkouts === 0) return undefined;
  if (!lastBackupAt) return Infinity;
  const age = Math.floor((now.getTime() - Date.parse(lastBackupAt)) / 86400000);
  return age > days ? age : undefined;
}
