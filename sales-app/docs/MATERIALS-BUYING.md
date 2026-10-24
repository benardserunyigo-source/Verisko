# Materials & buying

Operations and Admin open **Jobs → Materials & buying**. Only clients with an approved payment appear. The existing client name and location are reused. If the client already has job records, choose the matching job reference. Each job has its own list.

1. **Plan materials:** choose items, quantities and China or Uganda. Use metres for cable. Choose Other for something new. Save once.
2. **Request buying:** flag the saved list for procurement inside the app. This does not send messages, place a supplier order or pay money.
3. **Record order:** on an item, enter the quantity ordered, date and supplier. The order reference and quote/evidence link are optional. Repeat for split orders.
4. **Record arrival:** enter only the quantity that arrived this time. Partial deliveries show what is still due. Each order and arrival stays in the history.

Cards show planned, ordered, arrived and still due. Still due means ordered goods that have not arrived. All materials arrived appears only when every planned amount has arrived.

An ordered line cannot be removed or changed into a different item. A changed list needs a new buying request before further orders or receipts. Existing order and delivery history stays intact. Saving an unchanged list keeps its request.

The list stays attached to the same client and job. A client plan made before a quote job exists remains available when the job is added later. No second client record is created. An older copy of the main workspace cannot overwrite this buying history.

Sales and Team Lead can see the overall materials progress on their client. Supplier names, evidence links, quantities and buying controls are restricted to Operations and Admin. Installers continue to use their existing site materials screen. Receiving here records arrival; it does not issue materials to an installer or confirm installation.

## Assign the installer

1. Open **Jobs → Materials & buying** and choose the paid client.
2. Record all arrivals. **Assign installer** appears when every planned item has arrived.
3. Choose the installer, work date, agreed pay and Verisko staff at the site. Add one position for each camera. The client and materials fill in from the saved job.
4. Tap **Send job offer**. The installer sees the date, site contact, materials and agreed pay in **Jobs → Installations**.
5. The installer taps **Accept job** or **Decline job**. Declining needs a short reason. Operations can refresh Materials & buying to see the reply and offer the same job again if needed.

Accepting opens the normal work checks. Pending or declined offers cannot record work or take site materials. Arrival at the warehouse does not mean issued to site: Operations still records what the installer takes and later checks the returns.

The offer keeps the same client ID and materials-plan ID. Repeated sends reuse one installation record. Stale updates are rejected. Once site materials, work times or installer evidence are recorded, Operations must use the existing installation rather than replace the job. Editing the procurement list is blocked while an offer is pending or accepted. Supplier prices, quote links and client payment details are not copied to the installer.

Offers and replies need a connection. Existing saved work checks retain the app’s offline workflow.

## Installer finishes and sends back the same job

After accepting the offer, the installer opens **Jobs → Installations**:

1. **Camera checks:** choose each camera, save cable and mounting checks, add photos, and test live view, recording, playback, coverage and phone viewing.
2. **Materials left:** record the amount used, damaged or missing for each issued item. The app works out what is left. For example, 100 metres sent minus 85 used leaves 15 metres to return.
3. **Finish & send:** finish the site visit, show the work to the Verisko staff member, save the handover checks, and tap **Send to Operations**.

The app lists missing checks and waits for all saved photos to reach the server before sending. The submitted record stays on the same installation ID and becomes read-only for the installer.

Operations opens **Jobs → Installations → Ready for review**, checks the photos and tests, and receives leftover stock in **Materials & returns**. Operations can approve the job or return a camera check with a reason. The installer fixes the returned item, adds the required new photo, and sends the same job again. A job cannot be approved while required checks or warehouse returns are still outstanding.

Camera capture, gallery choice and GPS should also be checked on the actual Android phones during the pilot. Automated API tests use fictional jobs and images, not real site evidence.

## Finish with the client

Installer: finish the checks, count materials left, show the work to Verisko staff and send the job for review. This does not close the client job.

Assigned site supervisor: approve the installation checks, then tap **Meet client & sign off**. Check the system together. The client signs and accepts; the supervisor confirms. The same client and materials stay linked.

If work needs fixing, choose **Fix needed**, say what must change and the next step. The job stays open. The installer saves a new repair visit, fix note and photo, then sends it back for review. Meet the client again after the checks pass. If the client is away, save **Client not available** with the next step.
