/* ============================================================
   Smartech Typing Tutor — Activation & Licensing
   Handles: server activation/deactivation calls, local license
   storage, and the 3-month activation expiry window.

   IMPORTANT: the source of truth for "when does this code expire"
   is the Expiry Date cell on the Licenses Google Sheet, not this
   file. This file just mirrors whatever the server last told it,
   so the UI can show a countdown without hitting the network on
   every single click. Actual enforcement (can this code still be
   used) always happens server-side in GoogleAppsScript_Activation_Backend.gs.
   ============================================================ */

const WEBAPP="https://script.google.com/macros/s/AKfycbwUV1w3JJwAr9NVDbj0Wl6KvC470bblktXNOknSCu-QLQIcCq95ggkV6gWNY7ijrsKr/exec";

/* localStorage key names for each product. */
const ACTIVATION_META = {
  ENG: { flag: "engActivated", code: "ENG_CODE", expiry: "ENG_EXPIRES_AT" },
  PBI: { flag: "pbiActivated", code: "PBI_CODE", expiry: "PBI_EXPIRES_AT" },
  HIN: { flag: "hinActivated", code: "HIN_CODE", expiry: "HIN_EXPIRES_AT" }
};

function rawDeviceString(){
  return navigator.userAgent + screen.width + screen.height;
}

/* ---------- server calls ---------- */

/* Returns { ok:true, expiresAt } on success (expiresAt is an epoch-ms
   number pulled straight from the sheet's Expiry Date cell), or
   { ok:false, reason:'EXPIRED'|'USED'|'INVALID' } otherwise. Shows a
   user-facing alert for the failure cases, same as before. */
async function activateProduct(code,type){

    const device = rawDeviceString();

    const url=
        WEBAPP+
        "?action=activate"+
        "&type="+type+
        "&code="+encodeURIComponent(code)+
        "&device="+encodeURIComponent(device);

    const res=await fetch(url);
    const txt=(await res.text()).trim();

    if(txt.indexOf("VALID")===0){
        const parts = txt.split("|");
        const expiresAt = parts[1] ? Number(parts[1]) : null;
        return { ok:true, expiresAt: expiresAt };
    }

    if(txt=="EXPIRED"){
        alert("This activation code has expired. Please get a new activation code from your institute — the same code can't be reused after it expires.");
        return { ok:false, reason:"EXPIRED" };
    }

    if(txt=="USED"){
        alert("Already activated on another computer.");
        return { ok:false, reason:"USED" };
    }

    alert("Invalid activation code.");
    return { ok:false, reason:"INVALID" };
}

/* ---------- local license mirror ---------- */

/* Marks a product activated *now*, storing the code and the expiry
   moment the SERVER returned (not a locally-guessed one). */
function markActivated(type, code, expiresAt){
  const m = ACTIVATION_META[type];
  if(!m) return;
  localStorage.setItem(m.flag, "true");
  if(code) localStorage.setItem(m.code, code);
  if(expiresAt) localStorage.setItem(m.expiry, String(expiresAt));
  else localStorage.removeItem(m.expiry);
}

function clearActivation(type){
  const m = ACTIVATION_META[type];
  if(!m) return;
  localStorage.removeItem(m.flag);
  localStorage.removeItem(m.code);
  localStorage.removeItem(m.expiry);
}

/* Status for a product based on the local mirror: whether it's
   currently active, expired, the stored code, and the expiry date. */
function getActivationInfo(type){
  const m = ACTIVATION_META[type];
  const flagged = m ? localStorage.getItem(m.flag) === "true" : false;
  const code = m ? (localStorage.getItem(m.code) || "") : "";
  const expRaw = m ? localStorage.getItem(m.expiry) : null;
  const expiresAt = expRaw ? Number(expRaw) : null;
  const now = Date.now();
  const timedOut = !!(flagged && expiresAt && now >= expiresAt);
  const daysLeft = expiresAt ? Math.max(0, Math.ceil((expiresAt - now) / (24*60*60*1000))) : null;

  return {
    active: flagged && !timedOut,
    expired: timedOut,
    code: code,
    expiresAt: expiresAt,
    daysLeft: daysLeft
  };
}

/* Use this for any access-gating check. If the locally-mirrored
   expiry has passed, this stops granting access on this device —
   but it does NOT call deactivate, because that would reset the
   code back to "NEW" and let it be reused, which defeats the
   point: an expired code should stay dead until you (the admin)
   either push its Expiry Date forward in the sheet, or hand the
   student a different code. */
function isActivationValid(type){
  const info = getActivationInfo(type);
  if(info.expired){
    clearActivation(type);
    return false;
  }
  return info.active;
}

function formatActivationDate(ms){
  if(!ms) return "—";
  const d = new Date(ms);
  return d.toLocaleDateString(undefined, { year:'numeric', month:'short', day:'numeric' });
}
