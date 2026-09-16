-- Set the hosted project's global Storage file size limit to at least 500 MB.
-- Application validation keeps non-video resources at 250 MB.
update storage.buckets
set file_size_limit = 524288000
where id = 'resources';
