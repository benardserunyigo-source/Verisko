# Photo upload reliability audit

Used fictional photos and a clone of the existing school job in isolated local storage. No real media, payments, account changes or production data writes.

Reproduced failures before fixes: a malformed successful upload reply returned an undefined photo ID; unreadable replacement retained the old unsaved selection; retrying the same receipt created another photo record. Phone testing also reproduced a dropped response hiding the saved proof and a workspace refresh dropping the queued replacement link.

Fixes: validate saved IDs before reporting success, clear failed selections, disable saving/another pick during processing and ignore late reads from another form/account; retain saved attachments until replacements arrive; persist queued replacement intent and avoid overwriting a newer image; attach completed uploads to the current refreshed record and guard in-flight refreshes. Receipt retries reuse a private role/account/content-scoped record. Existing receipt UUIDs still work. Clear under25MB/unreadable-image messages for installer and generic photo inputs, and actionable guided-photo stale-save message.

731 tests pass, including new malformed-reply, unreadable-pick, receipt retry/isolation, queued replacement/newer-photo, workspace-refresh-during-upload and installer invalid/oversize checks. Existing installer durable offline retries, private site-guide cross-role/stale/concurrent saves and receipt access tests remain passing.

Actual390px UI: invalid JPEG rejected; existing receipt stays visible on a deliberately lost successful response; reopen retries successfully; same cash entry reopened with its new saved image. One deterministic receipt despite retries. Real-handler HTTP readback uploaded Sales overview and Operations mounting retakes, retried each once, and retrieved exact bytes as Sales/Operations/assigned Installer; unrelated accounts denied. All22 existing installer evidence images still open for Operations; unassigned installer denied. One350Kcash/source payment,20mcable return and approved client plan unchanged.

Evidence output/audits/photo-upload-20261028/: failure-case-snapshot.json, e2e-check.json, final-snapshot.json.gz, saved-proof-phone.png; local server includes real private receipt and site-photo handlers plus an explicit lost-response fixture. Image is a clearly fictional school illustration, not installation quality evidence.

Actual Android hardware camera/file chooser, locked-screen/offline device behavior and TalkBack still require the existing handset pilot. Browser/handler tests do not establish handset acceptance. Released v176 source2c20e2b669b035296751911e1ea932664dd2244a, ready deploy6ae1816c4e468318502304cf.47publicassets match;12APIs return JSON401 and private receipt endpoint JSON403. Live read-only Operations preview loads with no console errors.
