export const reportStatus = {
  new: { label: 'New', tone: 'blue' },
  in_review: { label: 'In review', tone: 'gold' },
  awaiting_pastor: { label: 'Awaiting response', tone: 'purple' },
  awaiting_leader: { label: 'Responded', tone: 'blue' },
  archived: { label: 'Archived', tone: 'neutral' },
}

export const urgencyLabels = {
  normal: 'Normal',
  important: 'Important',
  urgent: 'Urgent',
}

export const categoryLabels = {
  general: 'General',
  sensitive: 'Sensitive',
}

/** Statuses an admin may set directly. New is entered by creation, not by hand. */
export const adminTransitions = [
  'in_review',
  'awaiting_father',
  'awaiting_leader',
  'archived',
]

export function statusLabel(status) {
  return reportStatus[status]?.label ?? status
}

export function statusTone(status) {
  return reportStatus[status]?.tone ?? 'neutral'
}

export function isArchived(report) {
  return report?.status === 'archived'
}

/** A single source of truth for which controls a page may render. */
export function allowedActions(report, user) {
  const admin = user?.role === 'admin'
  const owner =
    !admin && String(report?.owner?._id || report?.owner) === String(user?.id)
  const archived = isArchived(report)

  return {
    canEdit: owner && !archived,
    canRespond: (owner || admin) && !archived,
    canTransition: admin,
    canArchive: admin && !archived,
    canReopen: admin && archived,
    canViewRevisions: owner || admin,
  }
}

export function formatRelative(value) {
  if (!value) return ''
  const days = Math.floor((Date.now() - new Date(value)) / 86400000)
  if (days <= 0) return 'Today'
  if (days === 1) return 'Yesterday'
  if (days < 7) return `${days} days ago`
  return new Date(value).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  })
}
