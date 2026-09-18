import type { UserProfile } from "@workspace/api-client-react";

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
) {
  if (accessState !== "PENDING") return "active" as const;
  return pathname.startsWith("/invite/")
    ? ("invitation" as const)
    : ("waiting" as const);
}
