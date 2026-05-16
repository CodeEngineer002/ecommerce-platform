-- Add optional variant association to product images.
-- When set, the gallery filters to only that variant's images on PDP.
-- NULL = shared image (shown for all variants, used as fallback).

ALTER TABLE product_images
  ADD COLUMN IF NOT EXISTS variant_id UUID
    REFERENCES product_variants(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_product_images_variant_id
  ON product_images(variant_id);
