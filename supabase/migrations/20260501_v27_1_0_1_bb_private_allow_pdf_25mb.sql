-- v27.1.0.1 — bb-private bucket config update.
-- v27.0a.15 created the bucket with image-only MIME types and a 10MB limit
-- for wallet photos. v27.1.0 added PDF doc uploads on /app/docs/new which
-- need application/pdf allowed and the size cap bumped to match the form's
-- 25MB ceiling.

UPDATE storage.buckets
SET
  allowed_mime_types = ARRAY[
    'image/jpeg',
    'image/png',
    'image/webp',
    'application/pdf'
  ],
  file_size_limit = 26214400  -- 25 MiB to match the upload form cap
WHERE id = 'bb-private';
