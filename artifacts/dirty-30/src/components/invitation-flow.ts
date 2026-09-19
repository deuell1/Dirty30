import type { UserProfile } from "@workspace/api-client-react";

export const INVITATION_RETURN_KEY = "dirty30-invitation-return";

type InvitationStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export function validInvitationPath(pathname: string | null | undefined) {
  return Boolean(pathname && /^\/invite\/[^/?#]+$/.test(pathname));
}

export function rememberInvitationPath(
  storage: InvitationStorage,
  pathname: string,
) {
  if (validInvitationPath(pathname))
    storage.setItem(INVITATION_RETURN_KEY, pathname);
}

export function preservedInvitationPath(storage: InvitationStorage) {
  const pathname = storage.getItem(INVITATION_RETURN_KEY);
  if (validInvitationPath(pathname)) return pathname!;
  if (pathname) storage.removeItem(INVITATION_RETURN_KEY);
  return null;
}

export function clearInvitationPath(storage: InvitationStorage) {
  storage.removeItem(INVITATION_RETURN_KEY);
}

export function invitationResumePath(
  pathname: string,
  storage: InvitationStorage,
) {
  const preserved = preservedInvitationPath(storage);
  return preserved && preserved !== pathname ? preserved : null;
}

type QueryCache = {
  invalidateQueries: (options: {
    queryKey: readonly unknown[];
  }) => Promise<unknown>;
  refetchQueries: (options: {
    queryKey: readonly unknown[];
  }) => Promise<unknown>;
  getQueryData: <T>(queryKey: readonly unknown[]) => T | undefined;
};

export async function refreshAfterInvitationAcceptance(
  client: QueryCache,
  keys: {
    currentUser: readonly unknown[];
    teams: readonly unknown[];
    team: readonly unknown[];
    roster: readonly unknown[];
  },
) {
  await Promise.all([
    client.invalidateQueries({ queryKey: keys.currentUser }),
    client.invalidateQueries({ queryKey: keys.teams }),
    client.invalidateQueries({ queryKey: keys.team }),
    client.invalidateQueries({ queryKey: keys.roster }),
  ]);
  await client.refetchQueries({ queryKey: keys.currentUser });
  return client.getQueryData<UserProfile>(keys.currentUser);
}

export function pendingSurface(
  pathname: string,
  accessState: UserProfile["accessState"],
  preservedInvitation?: string | null,
) {
  if (accessState !== "PENDING") return "active" as const;
  return pathname.startsWith("/invite/") ||
    validInvitationPath(preservedInvitation)
    ? ("invitation" as const)
    : ("waiting" as const);
}
