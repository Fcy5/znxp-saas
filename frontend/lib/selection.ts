export const WEEKLY_CAMPAIGNS = [
  "Memorial Day",
  "Father's Day",
  "Graduation",
  "Summer",
] as const

export const SELECTION_STATUSES = [
  "candidate",
  "shortlisted",
  "featured",
  "rejected",
] as const

export type WeeklyCampaign = typeof WEEKLY_CAMPAIGNS[number]
