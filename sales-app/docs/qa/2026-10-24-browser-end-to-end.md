# Fresh browser end-to-end test

Run: 24 October 2026, Uganda time. Source: `59c439d`, application v128. No production data or app code was changed.

## Result

The complete client journey reached an approved installation through the actual app controls. The full automated suite also passed again: **492 tests, zero failures**. One integration discrepancy was found outside the existing green assertions: the separate quote/job record still had stage `Sent` after the linked technical installation was approved. Do not treat this result as unconditional acceptance of every dashboard or of real Android behavior.

## Browser sequence

Started a fresh local server with an empty fictional workspace, using the real data, queue and installer HTTP handlers. The local authentication fixture supplies fictional role identities; it does not test production PIN verification. GPS was a fixed sample, and uploaded images were generated test images.

1. Sales saved TEST End-to-end Pharmacy, then submitted the same saved contact for a site visit.
2. Team Lead saw it in the shared queue, claimed it and assigned it to Operations.
3. Operations confirmed and completed the visit.
4. Operations created an actual priced quote through Job records, selecting the existing client and setting Sent. No WhatsApp message was sent. The queue's quote selector automatically offered the saved J-2026-0001 quote.
5. Operations recorded a fictional UGX 2,000,000 first payment. Admin signed in and approved it. This did not transfer any money.
6. Operations saved one materials plan: four cameras from China and 200 metres of cable from Uganda. Requested buying, recorded both orders and received both arrivals. Installer assignment appeared only after all materials arrived.
7. Operations offered the same job to the installer with UGX 350,000 agreed pay, the Operations site staff contact and four camera positions. Installer signed in, accepted, and saw only the assigned installation work.
8. Operations confirmed work rules, issued four cameras and 200 metres to the site, confirmed the dispatch list and uploaded the reference-work image.
9. Installer started work with sample GPS, uploaded five evidence images per camera, saved cable and mounting checks, and saved all five system-test results per camera. The app reached 4/4 checked.
10. Installer recorded four cameras fitted and 180 metres of cable used. The app calculated 20 metres left. Completed the work session, uploaded handover evidence and saved final checks. Send remained unavailable until required checks were satisfied.
11. Installer submitted. The job became read-only pending Operations review. Operations opened the saved handover photo through the protected endpoint.
12. Operations approval was unavailable while the cable return remained due. Operations received 20 metres into warehouse stock; approval became available. Approved the same job with review notes.
13. Reloaded the app: the installation remained Completed. Sales signed in and saw Installation approved, payment approved and UGX 100,000 commission added once. Sales dashboard showed UGX 115,000 total (one completed visit plus one first-payment commission, no weekly bonus).

An invalid initial tiny image fixture was rejected by browser decoding. A valid generated PNG then uploaded successfully. No app fix was needed for that fixture error.

## Independent server readback

Read the actual local HTTP endpoints after completing the UI sequence. Assertions passed for one contact, one visit, one quote, one first payment, one material plan and one installation; IDs linked correctly throughout. All **22 images** were saved (reference + 20 camera photos + handover). The installation status was Completed, approved by Operations, with finished start/end work marks. Cable quantities reconciled: 200 issued, 180 used, 20 received back. Another salesperson had no contacts and another installer had no assigned installation.

Evidence: `/Users/ben/Verisko/output/audits/browser-e2e-20261024/verified-records.json`, `operations-completed.jpg` and `sales-approved.jpg`. Private local request log: `.cfo-audit-20261018/browser-e2e-events.jsonl`. These are fictional test records only.

## Open issues and acceptance limits

- **Job records status:** linked installation Completed and Sales Installation approved, but source quote/job stage still Sent. Existing tests assert progress linkage but do not assert reconciliation of that separate lifecycle. Follow-up needs a regression test and a clear distinction between technical completion and commercial/funding approval; do not silently mark contracts accepted or bypass financing controls.
- Actual Android permissions, locked-screen tracking, offline recovery, device camera/gallery and real microphone/speaker acceptance remain pending.
- This test does not prove real production login, multi-device cloud persistence, physical camera performance, supplier buying, money transfer or client-message delivery. No real person was impersonated or invited.
