export default {
  async fetch(request, env) {
    const corsHeaders = {
      "Access-Control-Allow-Origin": "https://paikarisell.ghotimarket.com",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    };
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
    try {
      const body = await request.json();
      const uid = body.uid || "N/A";
      const email = body.email || "N/A";
      const amount = body.amount || "N/A";
      const transectionId = body.transectionId || "N/A";
      const sendedNumber = body.sendedNumber || "N/A";
      const accountType = (body.accountType || "N/A").toUpperCase();
      const sendMoneyNumber = body.sendMoneyNumber || "01727003670";
      const banglaTime = new Date().toLocaleString("bn-BD", { timeZone: "Asia/Dhaka", dateStyle: "full", timeStyle: "medium" });
      const message = `💰 নতুন Balance Add Request\n\n🆔 UID: ${uid}\n📧 ইমেইল: ${email}\n\n💳 Method: ${accountType}\n💵 Amount: ৳${amount}\n📱 Sender: ${sendedNumber}\n📥 Receiver: ${sendMoneyNumber}\n🔑 TrxID: ${transectionId}\n\n🕒 ${banglaTime}\n\nPAIKARI SELL - Balance Pending`;
      await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: env.TELEGRAM_CHAT_ID, text: message })
      });
      return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    } catch (e) {
      return new Response(JSON.stringify({ success: false, error: e.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
  }
}
