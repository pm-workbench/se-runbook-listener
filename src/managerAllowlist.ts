/**
 * A small, hand-maintained list of Island emails allowed to call the
 * manager-only endpoints (GET /users, GET /users/:tenantId/:userId/progress).
 *
 * Set as MANAGER_EMAILS (comma-separated) in the environment — a Portainer
 * stack env var edit + container restart, no redeploy needed to add/remove
 * a manager.
 *
 * Trust model matches the rest of this app (see CLAUDE.md): the caller's
 * email arrives via the `x-island-user-email` header, asserted by the
 * frontend from the SDK's unsigned `getUserInfo()` — there is no signature
 * to verify it actually came from that Island session. Accepted for the
 * same reason individual progress-sync trust is accepted: nothing behind
 * this is sensitive, it's runbook progress and links to process docs.
 * If that risk profile ever changes, this whole trust model needs
 * revisiting with Island's platform team — not something fixable here.
 */
function loadAllowlist(): Set<string> {
  const raw = process.env.MANAGER_EMAILS ?? ''
  return new Set(
    raw
      .split(',')
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean),
  )
}

export const managerAllowlist = loadAllowlist()

export function isManagerEmail(email: string | undefined | null): boolean {
  return !!email && managerAllowlist.has(email.trim().toLowerCase())
}
