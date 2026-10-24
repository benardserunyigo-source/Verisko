# Client quote link and plan reply

## Scope

Operations/Admin: Jobs → Job records → Share via WhatsApp → Create client link → Copy link or Send on WhatsApp. Quote PDF remains available separately. The client opens a no-login phone page, sees checked scope/prices and offered payment choices, enters their name, ticks Yes and confirms. Reply appears on the same source job in Job records and Job summaries. Check client reply or reopen the sheet to refresh. No automatic payment, acceptance, funding approval, commission or quote-price mutation. This remains a quotation, not a tax invoice or payment receipt.

## Tests

555 tests passed after the final version update. Tests cover checked two-plan offers, client-field whitelist/privacy, all issuing/list role denials, invalid token/job, mandatory choice/name/Yes, immutable replay, simultaneous replies, expiry/revocation/replacement, changed/cancelled/deleted source, accepted-plan restriction, creation retry/history protection, cross-origin/malformed bodies, fragment/no-third-party/no-cache page and both API route configurations.

Local real-handler QA uses an isolated fictional DEMO Payment Plan Shop at4411, keeping the earlier Kato4406 demo intact. Operations created a link through actual UI; anonymous client page offered3-month40/30/30 and60/40 choices. Client selected3months, named DEMO Client, confirmed, and Operations reopened the same job to read the saved plan/name/time. No WhatsApp link was sent. Existing main job/payment/funding/commission records are untouched by the choice endpoint (asserted in tests); same source ID retained. Customer success page fits390px. Operations responsive DOM had no horizontal overflow at390px; the iframe phone view showed its reply and controls, while native capture of an iframe top-layer dialog produced a gray image, so retain the readable desktop screenshot instead of calling that gray capture visual evidence. Frame screenshots for the non-modal client page are readable. No handset acceptance claim.

Evidence: `output/audits/client-plan-links-20261024/`: client-options-phone.png (initial full browser view; filename predates corrected framing), client-confirmed-phone.png (390px customer confirmation), operations-reply-desktop.png. Do not use operations-reply-phone.png, which captured a gray iframe dialog.

## Release

Frontendv139 and service-worker shellv5 prepared; deployment verification pending. No real client, account or financial records modified and no external messages sent.
