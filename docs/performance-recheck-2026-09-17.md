# Production performance recheck, 17 September 2026

## Method

Repeated the baseline's six signed-in desktop Chrome navigations/reloads, two per route, with the browser cache retained. Measurements taken around 07:47 to 07:49 NZST after the user deployed the changes. No production mutations or emails. Browser focus was explicitly approved; DevTools was closed and the original training URL restored afterward.

New production deployment: `dpl_3QCtP3eGH3xHTfJNpyoQnkRZxLBo`. The committed configuration selects `syd1`. The observed dashboard request was received in Sydney and no longer shows the prior routing hop to Washington, D.C.

## Browser results

All timings are milliseconds, from Navigation Timing. Response interval includes streamed server waits and transfer. Load is loadEventEnd, not a full interaction readiness metric.

| Page | Sample | TTFB | Response interval | DOM content loaded | Load | Before load |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| Training, general resources | 1 | 71 | 1934 | 2007 | 2115 | 6307 |
| Training, general resources | 2 | 46 | 332 | 442 | 590 | 3318 |
| Bookings | 1 | 178 | 371 | 584 | 675 | 3316 |
| Bookings | 2 | 44 | 302 | 363 | 471 | 1938 |
| Dashboard | 1 | 207 | 442 | 666 | 758 | 3302 |
| Dashboard | 2 | 50 | 478 | 531 | 611 | 2202 |

Mean across the six observations: before 3397 ms, after 870 ms, about 74% lower. This is a small sequential sample, not a statistically controlled benchmark or a population percentile. The first training sample still took 2.12 seconds; warm repeats do not establish cold-start performance.

## Matching server evidence

[Dashboard request](https://vercel.com/nz-esports-projects/school-booking-platform/logs?selectedLogId=jkgh7-1789588121542-9bb6521ba60c), 2026-09-16T19:48:41.542Z, production main:

* Response finished in 478 ms, matching the measured browser response interval.
* Function execution 378 ms, versus 2.54 seconds in the baseline dashboard repeat.
* Middleware execution 88 ms.

| Supabase HTTP request | Before dashboard repeat | After dashboard repeat |
| --- | ---: | ---: |
| Booking requests | 1070 ms | 214 ms |
| Booking sessions | 685 ms | 209 ms |
| Ambassador reports | 605 ms | 129 ms |
| Booking activity logs, shared loader | 992 ms | 153 ms |
| Notifications | 775 ms | 112 ms |
| Ambassador travel regions | 1900 ms | 107 ms |

Requests overlap and may include cache-refresh work; do not add their durations. These are HTTP timings, not newly measured SQL execution statistics.

## Rendering error

No new React error 418 appeared during the measured reloads. The captured error history still contained an earlier error at 07:43:05 NZST referencing the OLD deployment, which was excluded from the new result. The training date change is consistent with resolving the observed mismatch, although broader browser coverage has not been tested.

## Conclusion

The first changes produced a substantial measured improvement, supported by shorter server and Supabase HTTP durations. Retain this focused fix and monitor ordinary use before beginning a broad loader refactor. The remaining first-load delay and shared-loader volume are potential next targets if users still notice waits. No further application changes were made during this recheck.
