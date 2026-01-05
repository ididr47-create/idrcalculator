import { NextResponse } from "next/server";

export async function POST(req: Request) {
  try {
    // 🔒 1. SECURITY: Origin Check
    const origin = req.headers.get('origin') || req.headers.get('referer');
    const allowedOrigins = [
        "http://localhost:3000",             
        "https://your-vercel-project.app"    // ⚠️ Change this after deploy
    ];
    
    // (Optional: Uncomment below line to enable strict blocking)
    // if (origin && !allowedOrigins.some(d => origin.startsWith(d))) return NextResponse.json({message: "Unauthorized"}, {status: 403});

    // 🔒 2. SECURITY: Token from Env
    const API_TOKEN = process.env.DELHIVERY_TOKEN; 
    if (!API_TOKEN) {
        return NextResponse.json({ success: false, message: "Server Config Error: Token Missing" }, { status: 500 });
    }

    const body = await req.json();
    const { pickupPincode, deliveryPincode, weight, paymentMode, codAmount } = body;
    
    const mode = paymentMode === 'Prepaid' ? 'Pre-paid' : 'COD';
    const cAmount = parseFloat(codAmount) || 0;

    const url = `https://track.delhivery.com/api/kinko/v1/invoice/charges/.json?md=S&ss=Delivered&d_pin=${deliveryPincode}&o_pin=${pickupPincode}&cgm=${weight}&pt=${mode}&cod=${cAmount}`;

    console.log(`fetching rate: ${mode} | COD: ${cAmount}`);

    const response = await fetch(url, {
      method: "GET",
      headers: {
        "Authorization": `Token ${API_TOKEN}`,
        "Content-Type": "application/json",
        "Accept": "application/json"
      }
    });

    const responseText = await response.text();
    let data;
    try { data = JSON.parse(responseText); } catch (e) {
        return NextResponse.json({ success: false, message: "Server Error" }, { status: 500 });
    }

    if (!data[0] || !data[0].total_amount) {
       return NextResponse.json({ success: false, message: data.error || "Rate fetch failed" }, { status: 400 });
    }

    // --- 🔥 FINAL MARKUP LOGIC (28%) 🔥 ---
    const rateData = data[0];
    const apiTotalWithTax = parseFloat(rateData.total_amount); // API Price

    // 1. Total Selling Price = API Price + 28%
    const sellingPriceTotal = apiTotalWithTax * 1.28;

    // 2. Reverse Calculate Breakdown
    const sellingTaxable = sellingPriceTotal / 1.18; // Remove 18% GST
    const sellingGST = sellingPriceTotal - sellingTaxable;

    // 3. Calculate COD Share
    let sellingCodCharge = 0;
    if (mode === 'COD') {
        // Your Rate Card: Min 40 or 1.5%
        const baseCod = Math.max(40, cAmount * 0.015);
        // Apply 28% Markup on COD also to match total
        sellingCodCharge = baseCod * 1.28;
    }

    // 4. Calculate Freight Share
    let sellingFreight = sellingTaxable - sellingCodCharge;

    // Safety: If freight goes negative (rare), fix it
    if (sellingFreight < 0) {
        sellingFreight = sellingTaxable;
        sellingCodCharge = 0;
    }

    return NextResponse.json({ 
        success: true, 
        rate: sellingPriceTotal.toFixed(2),     
        freight: sellingFreight.toFixed(2),
        cod_charges: sellingCodCharge.toFixed(2), 
        taxable_amount: sellingTaxable.toFixed(2),
        gst: sellingGST.toFixed(2)
    });

  } catch (error: any) {
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}