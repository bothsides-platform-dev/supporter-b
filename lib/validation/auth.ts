import { z } from 'zod';

export const emailSchema = z.string().trim().email().max(254).toLowerCase();

export const passwordSchema = z.string()
  .min(10, 'MIN 10')
  .regex(/[A-Za-z]/, 'A-Z 1+')
  .regex(/\d/, '0-9 1+')
  .regex(/[^A-Za-z0-9]/, '!@# 1+');

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1),
  rememberMe: z.boolean().default(false),
  next: z.string().optional(),
});

export const signupEmailSchema = z.object({
  email: emailSchema,
  agreeTerms: z.literal(true),
  agreePrivacy: z.literal(true),
  agreeMarketing: z.boolean().default(false),
});

export const signupProfileSchema = z.object({
  name: z.string().trim().min(1).max(40),
  phone: z.string().regex(/^010-?\d{4}-?\d{4}$/).optional().or(z.literal('')),
  password: passwordSchema,
  passwordConfirm: z.string(),
}).refine(d => d.password === d.passwordConfirm, {
  path: ['passwordConfirm'], message: '비밀번호가 일치하지 않습니다',
});

export const workspaceCreateSchema = z.object({
  name: z.string().trim().min(1).max(40),
  bizName: z.string().trim().max(60).optional(),
  industry: z.enum(['saas', 'agency', 'manufacturing', 'retail', 'services', 'other']),
});

export const passwordResetSchema = z.object({
  password: passwordSchema,
  passwordConfirm: z.string(),
}).refine(d => d.password === d.passwordConfirm, {
  path: ['passwordConfirm'], message: '비밀번호가 일치하지 않습니다',
});
