# Production performance baseline, 17 September 2026

## Scope and method

Read-only investigation of the signed-in production admin application in desktop Chrome, approximately 07:25 to 07:35 NZST. Six full navigations/reloads, two per route, with the existing browser cache retained. No artificial network or CPU throttling was applied. This is a small diagnostic sample, not a percentile benchmark, cold-cache test, or client-side navigation benchmark.

Production deployment: `dpl_5ewyieixvDRyJNCKxGTS5tp8oq8L`, commit `cf93a920b0155541188e4ab8dc8ecbccc69ce7ab`, branch `main`. No code, configuration, bookings, or email settings were changed during measurement.

## Browser measurements

Values are milliseconds, except encoded document size. Taken from the browser Navigation Timing API. TTFB is responseStart relative to navigation start. Response interval is responseEnd minus responseStart, including streaming, server waits and network transfer, not just file download. Load is loadEventEnd, not a guarantee that all background work or interactions are ready.

| Route | Sample | TTFB | Response interval | DOM content loaded | Load | Document KB |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| /admin/training?view=general&saved=resource | 1 | 412 | 5738 | 6174 | 6307 | 21 |
| /admin/training?view=general&saved=resource | 2 | 171 | 2983 | 3192 | 3318 | 21 |
| /admin/bookings | 1 | 56 | 3086 | 3177 | 3316 | 42 |
| /admin/bookings | 2 | 68 | 1714 | 1833 | 1938 | 41 |
| /admin | 1 | 45 | 3129 | 3181 | 3302 | 29 |
| /admin | 2 | 184 | 1912 | 2115 | 2202 | 29 |

No Server-Timing entries were present. On the second dashboard sample, first contentful paint was 1720 ms. Resource entries totaled about 22 KB transferred with the browser cache warm; these entries included route prefetch requests and exclude the main document. This is not a cold bundle size measurement.

## Production request evidence

### Confirmed regional mismatch

Supabase project settings show `ap-southeast-2`, Oceania (Sydney). Vercel logs show requests received in Sydney (`syd1`) but routed to the application function in Washington, D.C. (`iad1`). Thus application-to-database calls cross regions. This is a concrete contributor to investigate first; the exact portion attributable to geography versus other HTTP overhead requires a before/after comparison.

### Slow training request

Request `pxh4t-1789586707226-217f6ab023b8`, 2026-09-16T19:25:07.226Z, GET /admin/training, 200:

* Middleware execution: 465 ms.
* Function execution: 4.61 s.
* Response finished: 5.7 s, consistent with the browser response interval.
* Function region: iad1.
* Selected Supabase HTTP durations: notifications 3.56 s, booking sessions 2.86 s, presentation types 3.55 s, booking session applications 3.61 s, ambassador reports 2.87 s, availability rules 2.90 s, training pack resources 2.89 s.

### Dashboard repeat request

Request `bswlp-1789586836722-2f1edf02d1c7`, 2026-09-16T19:27:16.722Z, GET /admin, 200:

* Middleware execution: 10 ms.
* Function execution: 2.54 s.
* Response finished: 1.9 s.
* Function region: iad1.
* Selected Supabase HTTP durations: booking requests 1.07 s, booking sessions 685 ms, ambassador reports 605 ms, booking activity logs 992 ms, notifications 775 ms, ambassador travel regions 1.90 s.

The calls overlap. Cache refresh/background work may outlast the response. Do not sum these durations or assume every call is on the response's critical path.

## Database execution statistics

Supabase Query Performance displayed the following rounded statistics. These are cumulative query-family statistics since an unspecified reset, not individual SQL traces matched to the six navigations.

| Query family | Calls | Mean SQL execution | Maximum |
| --- | ---: | ---: | ---: |
| Booking sessions | 349 | 5 ms | 39 ms |
| Ambassador reports | 482 | 4 ms | 33 ms |
| Booking activity logs | 482 | 3 ms | 33 ms |
| Notifications | 582 | 1 ms | 10 ms |

The database overview's last-24-hour figures showed CPU 2%, memory 54%, disk IO 1%, and peak connections 15 of 60. These aggregate snapshots do not exclude brief spikes, but give no evidence that database capacity is the main bottleneck. The displayed 99.94% cache hit ratio is the PostgreSQL buffer cache, not the application cache.

The difference between millisecond SQL execution and much longer Supabase HTTP requests points to request/network/API overhead, rather than these SQL statements themselves taking seconds. It does not isolate DNS, TLS, connection queuing, PostgREST, and network transit separately.

## Code and browser findings

* `lib/services/portal.ts` uses a shared platform-data loader with a 60-second cache. A refresh fetches approximately 28 data groups, including all-history bookings, reports, payments, resources, training and email templates. The training request logs confirm broad booking-related requests even on the training page.
* Admin data assembly awaits user notifications after the shared loader. A slow uncached notification request can extend the page wait even when other data is cached.
* `app/portal/actions.ts` broadly invalidates the platform and availability caches through its revalidation wrapper. This is a potential source of repeated refresh work, not a measured attribution for every navigation.
* Both measured training reloads produced React error 418, a hydration mismatch. React regenerates the affected tree on the client. The exact mismatching element and its timing cost have not been isolated.
* Resource listing code maps metadata and download links. Increasing the permitted upload size does not itself cause every page to download videos. No evidence in this investigation establishes the larger upload limit as the cause.

## Recommended order of changes

1. Align the Vercel application function region with the Sydney database, then repeat the same six measurements on a separately identified deployment. This is the smallest high-value experiment. Do not move the database as the first step.
2. Fix the training hydration mismatch and verify that error 418 disappears.
3. Remove avoidable serial waits, especially loading notifications independently of the main page where appropriate, while preserving per-user access controls.
4. Split the broad platform loader by page and narrow cache invalidation. Paginate/filter data at the server when needed. Preserve fresh booking status and permission correctness.
5. Add narrow application timing spans for auth, shared data, notifications and render preparation if the remaining delay cannot be explained. Repeat before/after measurements rather than assuming gains.

We have enough evidence to choose the first experiment. We do not yet have an exact millisecond breakdown of every layer, a historical pre-upload baseline, or proof that one change explains the entire recent regression. No refactor or deployment has been performed.

## Sources

* [Vercel training request](https://vercel.com/nz-esports-projects/school-booking-platform/logs?selectedLogId=pxh4t-1789586707226-217f6ab023b8)
* [Vercel dashboard request](https://vercel.com/nz-esports-projects/school-booking-platform/logs?selectedLogId=bswlp-1789586836722-2f1edf02d1c7)
* [Supabase project region](https://supabase.com/dashboard/project/yrzwujybvomjvehqvpvm/settings/general)
* [Supabase query performance](https://supabase.com/dashboard/project/yrzwujybvomjvehqvpvm/observability/query-performance)
* [React error 418](https://react.dev/errors/418)

Dashboard links require account access; logs have provider retention limits. The aggregate values above preserve this baseline without retaining contact details or credentials.
