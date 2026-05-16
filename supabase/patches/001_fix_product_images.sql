-- Patch 001: Assign unique, product-appropriate images to each seeded product.
--
-- The original seed.ts inserted the same Unsplash watch photo for every product.
-- Run this once in Supabase SQL Editor (or via `supabase db execute`) to fix
-- the existing product_images rows.
--
-- Safe to re-run: uses UPDATE … WHERE to match exact SKUs.

UPDATE public.product_images pi
SET    url = 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=800' -- headphones
FROM   public.products p
WHERE  pi.product_id = p.id
  AND  p.sku = 'ELEC-001';

UPDATE public.product_images pi
SET    url = 'https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=800' -- smart watch
FROM   public.products p
WHERE  pi.product_id = p.id
  AND  p.sku = 'ELEC-002';

UPDATE public.product_images pi
SET    url = 'https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?w=800' -- cotton t-shirt
FROM   public.products p
WHERE  pi.product_id = p.id
  AND  p.sku = 'FASH-001';

UPDATE public.product_images pi
SET    url = 'https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=800'  -- running sneakers
FROM   public.products p
WHERE  pi.product_id = p.id
  AND  p.sku = 'FASH-002';
