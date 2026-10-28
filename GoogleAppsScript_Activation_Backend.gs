/**
 * ============================================================
 *  Smartech Typing Tutor — Activation Backend (Licenses sheet)
 * ------------------------------------------------------------
 *  Paste this WHOLE file into the Apps Script editor bound to
 *  your LICENSES sheet (the one with the ENG/PBI/HIN code
 *  columns), replacing whatever doGet() is there now. Re-deploy
 *  the web app (Deploy ▸ Manage deployments ▸ Edit ▸ New version)
 *  so the change goes live at the same URL.
 *
 *  SHEET COLUMNS THIS EXPECTS (1-based, i.e. A=1, B=2 ...):
 *    D / E / F   = ENG  code / status / device
 *    G / H / I   = PBI  code / status / device
 *    J / K / L   = HIN  code / status / device
 *    M           = Last Activity (shared timestamp, unchanged)
 *    N           = ENG Expiry Date   <-- NEW, add this column
 *    O           = PBI Expiry Date   <-- NEW, add this column
 *    P           = HIN Expiry Date   <-- NEW, add this column
 *
 *  If N/O/P are already used for something else in your sheet,
 *  change the "expiry" numbers in the map below to whichever
 *  free columns you'd rather use.
 *
 *  HOW EXPIRY WORKS:
 *   - The first time a code is activated, its Expiry Date cell
 *     is set automatically to today + ACTIVATION_DAYS (90).
 *   - Every time that same device checks back in, the script
 *     reads the Expiry Date cell LIVE. If you edit that cell by
 *     hand in the sheet (push it forward, pull it back), your
 *     change takes effect on the very next check — no code
 *     changes needed on your end.
 *   - Once "now" is past the Expiry Date, the code stops working
 *     for everyone — status stays USED, so the SAME code can't
 *     just be re-entered to renew itself. You'd issue a new code
 *     (a different row) to that student, or manually push the
 *     Expiry Date cell forward if you want to extend that exact
 *     code instead.
 *   - Deactivating a code (the app's "Deactivate" button) resets
 *     status to NEW, clears the device, and clears the expiry —
 *     so it comes back as a brand-new, unused code.
 * ============================================================
 */

function doGet(e) {

  var action = String(e.parameter.action || "ACTIVATE").toUpperCase().trim();
  var type = String(e.parameter.type || "").toUpperCase().trim();
  var code = String(e.parameter.code || "").toUpperCase().trim();
  var device = String(e.parameter.device || "").trim();

  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Licenses");
  var data = sheet.getDataRange().getValues();

  // column numbers are 1-based (A=1, B=2, ...)
  var map = {
    ENG: { code:4,  status:5,  device:6,  expiry:14 }, // D, E, F, N
    PBI: { code:7,  status:8,  device:9,  expiry:15 }, // G, H, I, O
    HIN: { code:10, status:11, device:12, expiry:16 }  // J, K, L, P
  };

  // Default validity window for a freshly-activated code.
  // Change this single number if you ever want the default to be
  // something other than 90 days.
  var ACTIVATION_DAYS = 90;

  if (!map[type])
    return ContentService.createTextOutput("INVALID");

  var c = map[type];

  for (var i = 1; i < data.length; i++) {

    var sheetCode = String(data[i][c.code-1]).toUpperCase().trim();

    if (sheetCode === code) {

      var status = String(data[i][c.status-1]).toUpperCase().trim();
      var savedDevice = String(data[i][c.device-1]).trim();
      var expiryRaw = data[i][c.expiry-1];
      var expiryDate = (expiryRaw instanceof Date)
        ? expiryRaw
        : (expiryRaw ? new Date(expiryRaw) : null);

      if (action === "ACTIVATE") {

        // Brand-new / never-used code.
        if (status === "" || status === "NEW") {

          var newExpiry = new Date();
          newExpiry.setDate(newExpiry.getDate() + ACTIVATION_DAYS);

          sheet.getRange(i+1, c.status).setValue("USED");
          sheet.getRange(i+1, c.device).setValue(device);
          sheet.getRange(i+1, c.expiry).setValue(newExpiry);
          sheet.getRange(i+1, 13).setValue(new Date()); // last-activity log

          return ContentService.createTextOutput("VALID|" + newExpiry.getTime());
        }

        // Already assigned to a device.
        if (status === "USED") {

          if (savedDevice !== device) {
            return ContentService.createTextOutput("USED");
          }

          // Same device checking back in. The sheet's Expiry Date
          // cell is the live source of truth — if it's in the past,
          // this code is dead until you edit the cell or issue a
          // different code.
          if (expiryDate && new Date() > expiryDate) {
            return ContentService.createTextOutput("EXPIRED");
          }

          sheet.getRange(i+1, 13).setValue(new Date()); // last-activity log
          var expiryMs = expiryDate ? expiryDate.getTime() : "";
          return ContentService.createTextOutput("VALID|" + expiryMs);
        }

        return ContentService.createTextOutput("USED");
      }

      if (action === "DEACTIVATE") {

        if (savedDevice !== device) {
          return ContentService.createTextOutput("DEVICE_MISMATCH");
        }

        sheet.getRange(i+1, c.status).setValue("NEW");
        sheet.getRange(i+1, c.device).clearContent();
        sheet.getRange(i+1, c.expiry).clearContent();

        return ContentService.createTextOutput("OK");
      }
    }
  }

  return ContentService.createTextOutput("INVALID");
}
