// Cache tags shared between the cached loaders and the write paths that
// invalidate them (server actions, cron routes).

// All portal/dashboard data loaded by loadPlatformData.
export const PLATFORM_DATA_TAG = "platform-data";

// Public site reference data: presentations, regions, homepage sections,
// testimonials, availability windows.
export const PUBLIC_CONTENT_TAG = "public-content";
