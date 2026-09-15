-- Hosted projects must also allow at least 250 MB in the global Storage settings.
-- Keep resources private; only raise this bucket's upload limit.
update storage.buckets
set file_size_limit = 262144000
where id = 'resources';
