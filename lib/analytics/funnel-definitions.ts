/** Buyer-only GA4 boundary. Only enum values and sanitized routes leave this module. */
export const EVENTS = [
  "funnel_step_view",
  "funnel_step_complete",
  "funnel_step_error",
  "funnel_cta_click",
  "sign_up",
  "quote_request_submitted",
] as const;
export type FunnelEvent = (typeof EVENTS)[number];
export const STEPS = {
  acquisition: [
    "landing",
    "quote_start",
    "draft_complete",
    "choose_login",
    "choose_signup",
    "member_return",
    "submitted",
  ],
  questions: [
    "website",
    "solution",
    "industry",
    "products",
    "sellers",
    "cash",
    "price",
    "sales",
    "delivery",
    "contract",
    "current-pgs",
    "payment",
    "annual",
    "fee",
    "limit",
    "insurance",
    "cycle",
    "title",
    "memo",
    "attachments",
  ],
  signup: [
    "email",
    "company",
    "profile",
    "phone",
    "account_created",
    "auto_login",
    "email_verification",
    "approval_pending",
    "app_entry",
  ],
  request: [
    "entry",
    "business",
    "questions",
    "recommendation",
    "review",
    "submitted",
  ],
} as const;
export type FunnelId = keyof typeof STEPS;
export type EntryPath = "guest" | "member" | "direct";
export type FunnelParams = {
  funnel_id: FunnelId;
  step_id: string;
  entry_path?: EntryPath;
  contract_type?: "new" | "renewal" | "unknown";
  mode?: "write" | "edit";
  progression?: "next" | "skip";
  error_code?: string;
};
export const ERRORS = [
  "VALIDATION",
  "NETWORK_ERROR",
  "STORAGE_ERROR",
  "INVALID_WEBSITE",
  "EMAIL_TAKEN",
  "PHONE_NOT_VERIFIED",
  "SIGNIN_FAILED",
  "TOKEN_INVALID_OR_EXPIRED",
  "UNKNOWN",
] as const;
