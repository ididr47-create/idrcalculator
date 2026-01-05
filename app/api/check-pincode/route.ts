import { NextResponse } from "next/server";

export async function GET(req: Request) {
  try {
    // 🔒 1. SECURITY: Origin Check (Sirf aapki site allow karega)
    const origin = req.headers.get('origin') || req.headers.get('referer');
    const allowedOrigins = [
        "http://localhost:3000",             // Local Testing
        "https://your-vercel-project.app"    // ⚠️ Deploy ke baad apna domain yahan dalein
    ];

    // Agar Origin safe list me nahi hai, to block kar do
    if (origin && !allowedOrigins.some(domain => origin.startsWith(domain))) {
        // Localhost par kabhi kabhi origin null hota hai, isliye strict block abhi hata raha hu testing ke liye
        // Production me isse enable kar sakte hain
    }

    // 🔒 2. SECURITY: Get Token from Env
    const API_TOKEN = process.env.DELHIVERY_TOKEN;
    if (!API_TOKEN) {
        return NextResponse.json({ success: false, message: "Server Error: Token Missing" }, { status: 500 });
    }

    // --- Main Logic Starts ---
    const { searchParams } = new URL(req.url);
    const pincode = searchParams.get("pincode");
    const type = searchParams.get("type"); 

    if (!pincode || pincode.length < 6) {
      return NextResponse.json({ success: false, isServiceable: false }, { status: 400 });
    }

    const delhiveryUrl = `https://track.delhivery.com/c/api/pin-codes/json/?filter_codes=${pincode}`;
    
    const response = await fetch(delhiveryUrl, {
      method: "GET",
      headers: {
        "Authorization": `Token ${API_TOKEN}`,
        "Content-Type": "application/json"
      }
    });

    const data = await response.json();
    let isServiceable = false;
    let message = "";

    if (data.delivery_codes && data.delivery_codes.length > 0) {
        const details = data.delivery_codes[0];
        const info = details.postal_code || details;
        
        const city = info.district || info.city || "";
        const state = info.state_code || "";
        const locationStr = city && state ? `${city}, ${state}` : city;

        if (type === 'pickup') {
            if (info.pickup === 'Y') {
                isServiceable = true;
                message = locationStr; 
            } else {
                isServiceable = false;
                message = `Pickup not available in ${locationStr}`;
            }
        } else {
            if (info.pre_paid === 'Y' || info.cod === 'Y' || info.cash === 'Y') {
                isServiceable = true;
                message = locationStr;
            } else {
                isServiceable = false;
                message = `No Delivery in ${locationStr}`;
            }
        }
    } else {
        // Fallback to Indian Post
        try {
            const postRes = await fetch(`https://api.postalpincode.in/pincode/${pincode}`);
            const postData = await postRes.json();
            if (postData && postData[0].Status === "Success") {
                const city = postData[0].PostOffice[0].District;
                const state = postData[0].PostOffice[0].State;
                message = `Not Serviceable in ${city}, ${state}`;
            } else {
                message = "Invalid Pincode";
            }
        } catch (err) {
            message = "Service Not Available";
        }
    }

    return NextResponse.json({ success: true, isServiceable, message });

  } catch (error: any) {
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}