export default {
  async fetch(request, env) {
    const ALLOWED = env.ALLOWED_ORIGIN || "https://paikarisell.ghotimarket.com";
    const origin = request.headers.get("Origin") || request.headers.get("Referer") || "";

    // CORS Preflight
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders(ALLOWED) });
    }

    // Domain Lock
    if (!origin.includes("paikarisell.ghotimarket.com")) {
      return jsonRes({ error: "Forbidden Domain" }, 403, ALLOWED);
    }

    if (request.method !== "POST") {
      return jsonRes({ error: "Method not allowed" }, 405, ALLOWED);
    }

    try {
      const authHeader = request.headers.get("Authorization");
      if (!authHeader?.startsWith("Bearer ")) {
        return jsonRes({ error: "No token" }, 401, ALLOWED);
      }
      const idToken = authHeader.split("Bearer ")[1];
      
      // Simple Token Verify (aud, exp, iss)
      const payload = JSON.parse(atob(idToken.split('.')[1]));
      if (payload.aud !== env.FIREBASE_PROJECT_ID) throw new Error("Invalid aud");
      if (payload.exp * 1000 < Date.now()) throw new Error("Token expired");
      const uidFromToken = payload.user_id || payload.uid;
      
      const body = await request.json();
      const uid = body.uid;
      if (!uid || uid !== uidFromToken) {
        return jsonRes({ error: "UID mismatch" }, 403, ALLOWED);
      }

      // Get Admin Access Token from Service Account
      const serviceAccount = JSON.parse(env.FIREBASE_SERVICE_ACCOUNT_JSON);
      const accessToken = await getAccessToken(serviceAccount);

      // Read Firestore Doc via REST API (Bypasses Rules)
      const url = `https://firestore.googleapis.com/v1/projects/${env.FIREBASE_PROJECT_ID}/databases/(default)/documents/add-balance/${uid}`;
      const fsRes = await fetch(url, {
        headers: { Authorization: `Bearer ${accessToken}` }
      });
      if (!fsRes.ok) {
        const errTxt = await fsRes.text();
        throw new Error("Firestore read failed: " + errTxt);
      }
      const doc = await fsRes.json();
      const f = doc.fields;

      const amount = f.amount?.doubleValue || f.amount?.integerValue || f.amount?.stringValue;
      const trxId = f.transectionId?.stringValue;
      const fromNum = f.sendedNumber?.stringValue;
      const method = f.accountType?.stringValue;
      const toNum = f.sendMoneyNumber?.stringValue;
      const email = payload.email || "N/A";

      // Telegram Message
      const msg = `🔔 *New Add Balance Request*\n\n💰 *Amount:* ${amount} ৳\n🏦 *Method:* ${method?.toUpperCase()}\n📱 *From:* ${fromNum}\n📲 *To:* ${toNum}\n🆔 *TrxID:* \`${trxId}\`\n👤 *UID:* \`${uid}\`\n📧 *Email:* ${email}\n\n⏰ ${new Date().toLocaleString('en-BD', { timeZone: 'Asia/Dhaka' })}`;

      await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: env.TELEGRAM_CHAT_ID,
          text: msg,
          parse_mode: "Markdown"
        })
      });

      return jsonRes({ success: true }, 200, ALLOWED);

    } catch (e) {
      console.error(e);
      return jsonRes({ error: e.message }, 500, ALLOWED);
    }
  }
};

function corsHeaders(origin) {
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Max-Age": "86400"
  };
}
function jsonRes(data, status, origin) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders(origin) }
  });
}

// Service Account -> Google Access Token
async function getAccessToken(sa) {
  const header = { alg: "RS256", typ: "JWT" };
  const now = Math.floor(Date.now() / 1000);
  const claim = {
    iss: sa.client_email,
    scope: "https://www.googleapis.com/auth/datastore",
    aud: "https://oauth2.googleapis.com/token",
    exp: now + 3600,
    iat: now
  };
  const enc = (o) => btoa(JSON.stringify(o)).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
  const unsigned = `${enc(header)}.${enc(claim)}`;
  const keyData = str2ab(sa.private_key);
  const key = await crypto.subtle.importKey("pkcs8", keyData, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);
  const sigBuf = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(unsigned));
  const sig = btoa(String.fromCharCode(...new Uint8Array(sigBuf))).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
  const jwt = `${unsigned}.${sig}`;

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`
  });
  const j = await res.json();
  if (!j.access_token) throw new Error("No access token: " + JSON.stringify(j));
  return j.access_token;
}
function str2ab(pem) {
  const b64 = pem.replace(/-----.*-----/g, '').replace(/\s/g, '');
  const bin = atob(b64);
  const ab = new ArrayBuffer(bin.length);
  const u = new Uint8Array(ab);
  for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
  return ab;
}
