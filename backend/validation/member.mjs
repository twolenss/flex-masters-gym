import { z } from 'zod';

export const memberCreateSchema = z.object({
  name: z.string().trim().min(2).max(120),
  phone: z.string().trim().min(5).max(30),
  plan: z.enum(['Monthly', 'Half-Month']),
  date: z.string().date(),
  amount: z.coerce.number().nonnegative().max(100000),
  method: z.enum(['Cash', 'GCash', 'Bank transfer']),
  photo: z.string().trim().max(600_000).optional().refine(value => !value || /^[A-Z+]{1,10}$/.test(value) || /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(value), 'Photo must be an image or initials'),
  dob: z.string().date().optional().or(z.literal('')),
  sex: z.enum(['Male', 'Female', 'Other']).optional(),
  address: z.string().trim().max(300).optional(),
  emergency: z.string().trim().max(150).optional()
});

export const renewalSchema = z.object({
  plan: z.enum(['Monthly', 'Half-Month']),
  date: z.string().date(),
  amount: z.coerce.number().nonnegative().max(100000),
  method: z.enum(['Cash', 'GCash', 'Bank transfer'])
});

export const guestSchema = z.object({
  name: z.string().trim().min(2).max(120),
  amount: z.coerce.number().nonnegative().max(100000),
  method: z.enum(['Cash', 'GCash']),
  status: z.enum(['Paid', 'Unpaid'])
});
