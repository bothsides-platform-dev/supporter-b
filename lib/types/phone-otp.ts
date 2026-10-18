export const PHONE_OTP_PURPOSES = ['signup', 'profile_phone_update'] as const;

export type PhoneOtpPurpose = (typeof PHONE_OTP_PURPOSES)[number];
