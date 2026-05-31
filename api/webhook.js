export default async function handler(req, res) {
  if (req.method === "GET") {
    const mode = req.query["hub.mode"];
    const token = req.query["hub.verify_token"];
    const challenge = req.query["hub.challenge"];

    if (mode === "subscribe" && token === process.env.META_VERIFY_TOKEN) {
      return res.status(200).send(challenge);
    }

    return res.status(403).send("Verification failed");
  }

  if (req.method === "POST") {
    try {
      const body = req.body;

      if (body.object !== "page") {
        return res.status(404).send("Not a page event");
      }

      for (const entry of body.entry || []) {
        for (const event of entry.messaging || []) {
          const senderId = event.sender?.id;

          if (!senderId) continue;

          if (event.message && event.message.text) {
            const userMessage = event.message.text;

            const aiReply = await generateGeminiReply(userMessage);

            await sendMessengerReply(senderId, aiReply);
          }
        }
      }

      return res.status(200).send("EVENT_RECEIVED");
    } catch (error) {
      console.error("Webhook error:", error);
      return res.status(500).send("Server error");
    }
  }

  return res.status(405).send("Method not allowed");
}

async function generateGeminiReply(userMessage) {
  const prompt = `
তুমি একজন বাংলা eCommerce customer support chatbot.

তোমার কাজ:
- কাস্টমারের প্রশ্নের উত্তর দেওয়া
- পণ্যের তথ্য দেওয়া
- অর্ডার নিতে সাহায্য করা
- অর্ডার করতে চাইলে নাম, ফোন নাম্বার, পূর্ণ ঠিকানা, পণ্যের নাম ও পরিমাণ জানতে চাওয়া
- উত্তর ছোট, সুন্দর ও ভদ্র হবে

Customer message:
${userMessage}
`;

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              { text: prompt }
            ]
          }
        ]
      })
    }
  );

  const data = await response.json();

  if (!response.ok) {
    console.error("Gemini error:", data);
    return "দুঃখিত, এখন উত্তর দিতে একটু সমস্যা হচ্ছে। অনুগ্রহ করে কিছুক্ষণ পরে আবার মেসেজ করুন।";
  }

  return data.candidates?.[0]?.content?.parts?.[0]?.text || "আমি বুঝতে পারিনি। আরেকটু বিস্তারিত বলবেন?";
}

async function sendMessengerReply(senderId, messageText) {
  const response = await fetch(
    `https://graph.facebook.com/v19.0/me/messages?access_token=${process.env.PAGE_ACCESS_TOKEN}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        recipient: {
          id: senderId
        },
        message: {
          text: messageText
        }
      })
    }
  );

  const data = await response.json();

  if (!response.ok) {
    console.error("Messenger send error:", data);
  }

  return data;
}
