import { z } from 'zod';

const password = z.string().min(12, 'Password must be at least 12 characters').max(128);

export const accountCreateSchema = z.object({
  name: z.string().trim().min(2).max(100),
  email: z.string().trim().email().max(254).transform(value => value.toLowerCase()),
  password,
  role: z.enum(['Owner', 'Receptionist'])
});

export const passwordChangeSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: password
}).refine(value => value.currentPassword !== value.newPassword, {
  message: 'New password must be different from the current password',
  path: ['newPassword']
});

export const accountUpdateSchema = z.object({
  role: z.enum(['Owner', 'Receptionist']).optional(),
  active: z.boolean().optional()
}).refine(value => value.role !== undefined || value.active !== undefined, 'No account changes provided');
