import { z } from "zod";

export const addressSchema = z.object({
  full_name:     z.string().min(2, "Name must be at least 2 characters"),
  phone:         z.string().optional(),
  address_line1: z.string().min(5, "Address is required"),
  address_line2: z.string().optional(),
  city:          z.string().min(1, "City is required"),
  /** Human-readable region name — auto-populated from region_code on submit */
  state:         z.string().optional(),
  /** Structured state/province/emirate code from dropdown, e.g. "CA", "MH", "DU" */
  region_code:   z.string().min(1, "State / Province is required"),
  postal_code:   z.string().min(1, "Postal code is required").max(12),
  country:       z.string().length(2, "Invalid country code"),
});

export const loginSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

export const registerSchema = z
  .object({
    full_name: z.string().min(2, "Name must be at least 2 characters"),
    email: z.string().email("Invalid email address"),
    password: z.string().min(8, "Password must be at least 8 characters"),
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

export const productSchema = z.object({
  name: z.string().min(2, "Product name is required"),
  slug: z.string().min(2, "Slug is required"),
  description: z.string().optional(),
  short_desc: z.string().max(200).optional(),
  category_id: z.string().uuid().optional().nullable(),
  base_price: z.number().positive("Price must be positive"),
  compare_price: z.number().positive().optional().nullable(),
  sku: z.string().optional(),
  tags: z.array(z.string()).default([]),
  is_active: z.boolean().default(true),
  is_featured: z.boolean().default(false),
  seo_title: z.string().max(60).optional(),
  seo_desc: z.string().max(160).optional(),
});

export const categorySchema = z.object({
  name: z.string().min(2, "Category name is required"),
  slug: z.string().min(2, "Slug is required"),
  description: z.string().optional(),
  parent_id: z.string().uuid().optional().nullable(),
  sort_order: z.number().int().default(0),
  is_active: z.boolean().default(true),
  seo_title: z.string().max(60).optional(),
  seo_desc: z.string().max(160).optional(),
});

export const checkoutSchema = z.object({
  shippingAddress: addressSchema,
  billingAddress: addressSchema.optional(),
  useSameAddress: z.boolean().default(true),
  couponCode: z.string().optional(),
  notes: z.string().optional(),
  paymentProvider: z.enum(["stripe", "razorpay", "cod"]),
});

export const reviewSchema = z.object({
  rating: z.number().int().min(1).max(5),
  title: z.string().max(100).optional(),
  body: z.string().max(1000).optional(),
});

export const couponSchema = z.object({
  code: z.string().min(3).max(20).toUpperCase(),
  description: z.string().optional(),
  type: z.enum(["percentage", "fixed"]),
  value: z.number().positive(),
  min_order_value: z.number().positive().optional().nullable(),
  max_discount: z.number().positive().optional().nullable(),
  usage_limit: z.number().int().positive().optional().nullable(),
  is_active: z.boolean().default(true),
  valid_from: z.string().datetime(),
  valid_until: z.string().datetime().optional().nullable(),
});

export const profileUpdateSchema = z.object({
  full_name: z.string().min(2),
  phone: z.string().optional(),
  avatar_url: z.string().url().optional(),
});

export type AddressFormData = z.infer<typeof addressSchema>;
export type LoginFormData = z.infer<typeof loginSchema>;
export type RegisterFormData = z.infer<typeof registerSchema>;
export type ProductFormData = z.infer<typeof productSchema>;
export type CategoryFormData = z.infer<typeof categorySchema>;
export type CheckoutFormData = z.infer<typeof checkoutSchema>;

/** Lightweight schema for the checkout page when addresses come from the address panel */
export const checkoutExtrasSchema = z.object({
  useSameAddress:  z.boolean().default(true),
  couponCode:      z.string().optional(),
  notes:           z.string().optional(),
  paymentProvider: z.enum(["stripe", "razorpay", "cod"]),
});
export type CheckoutExtrasData = z.infer<typeof checkoutExtrasSchema>;
export type ReviewFormData = z.infer<typeof reviewSchema>;
export type CouponFormData = z.infer<typeof couponSchema>;
export type ProfileUpdateFormData = z.infer<typeof profileUpdateSchema>;
