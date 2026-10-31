# Sign-in and role journey — 31 October

Owner requested fictional-only verification: Admin email or PIN; other roles PIN only; each role sees only needed data.

## Evidence

- New sign-in-role-journey.test.js connects the real auth handler, issued eight-digit PIN, shared identify, data handler and installation handler. Stores are in memory; verified email identity is simulated, not a live provider session.
- Admin verified email and actual issued-PIN sessions return identical Admin workspace data.
- Operations, Team Lead, Sales and Installer email sessions receive403 from data and installation APIs. Their actual issued-PIN sessions work.
- Sales sees only its own contact, no private finance or installation workspace. Team Lead sees visit contacts and assigned supervised installations, no installer pay. Operations sees office contacts/jobs/money but no Admin export key. Installer sees no contacts/company cash; assigned installation only, own agreed pay only; guessing another installation returns404.
- Non-Admin PIN sessions cannot create another member’s PIN. Previously accepted Admin email is denied after stored-role demotion or removal. Commercial records remain byte-equivalent to seeded fictional data.
- Full suite:761passed/0failed, including earlier crafted-write/receipt/media/role/privacy tests. No runtime code change was required.

## Actual browser, local and isolated

localhost4555 serves actual app/auth/role projection handlers with in-memory journey data. Email OTP delivery and provider verification are local test doubles; the browser follows a fictional inbox link, never a real mailbox.

At390px: Admin requested a test email link, opened it and reached Admin workspace. Logout then Admin-issued PIN reached the same workspace. Sales email callback was refused with “Email sign-in is for Admin only”; PIN then reached Home/Contacts/My work/My pay. Operations PIN reached Today/Contacts/Jobs/Money. Team Lead PIN reached Home/Contacts/Jobs/More and visit work. Installer PIN reached Home/Jobs/More, no Contacts/Money. Final viewport width390/content390. Screenshots in private output/audits/sign-in-roles-20261031.

No production records, real credentials, roles or emails changed. Existing live v185 runtime unchanged. Live provider email delivery, real-user PIN acceptance and physical Android checks are not established by these tests.
