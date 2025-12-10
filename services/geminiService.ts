
import { GoogleGenAI } from "@google/genai";
import { AnalysisResult, SourceLink, MarketOverviewResult, MarketCoinRaw, MarketCoinAnalysis } from "../types";

// Helper to fetch real-time price from Binance
const getRealtimePrice = async (symbol: string): Promise<string | null> => {
  try {
    const response = await fetch(`https://api.binance.com/api/v3/ticker/price?symbol=${symbol}USDT`);
    if (!response.ok) return null;
    const data = await response.json();
    return parseFloat(data.price).toString();
  } catch (error) {
    console.error("Failed to fetch Binance price:", error);
    return null;
  }
};

// Helper to fetch multiple prices for Alerts (Optimization)
export const getBatchPrices = async (symbols: string[]): Promise<Record<string, number>> => {
  if (symbols.length === 0) return {};
  const uniqueSymbols = [...new Set(symbols)];
  try {
    // Format for Binance: ["BTCUSDT","ICPUSDT"]
    const formattedSymbols = JSON.stringify(uniqueSymbols.map(s => `${s.toUpperCase()}USDT`));
    const response = await fetch(`https://api.binance.com/api/v3/ticker/price?symbols=${encodeURIComponent(formattedSymbols)}`);
    
    if (!response.ok) return {};
    
    const data = await response.json(); 
    // data structure: [{symbol: "BTCUSDT", price: "10000.00"}]
    
    const result: Record<string, number> = {};
    if (Array.isArray(data)) {
        data.forEach((item: any) => {
            const rawSymbol = item.symbol.replace('USDT', '');
            result[rawSymbol] = parseFloat(item.price);
        });
    }
    return result;
  } catch (e) {
    console.error("Batch price fetch error:", e);
    return {};
  }
};

// Fetch Top 30 Liquid Coins (Excluding Stablecoins)
const fetchTopMarketData = async (): Promise<MarketCoinRaw[]> => {
  try {
    const response = await fetch("https://api.binance.com/api/v3/ticker/24hr");
    if (!response.ok) throw new Error("Failed to fetch market data");
    const data = await response.json();

    const STABLE_COINS = ['USDT', 'USDC', 'FDUSD', 'TUSD', 'DAI', 'USDD', 'PYUSD', 'USDE', 'EUR', 'BUSD'];
    const EXCLUDE_TOKENS = ['UP', 'DOWN', 'BEAR', 'BULL']; // Leveraged tokens

    const filtered = data
      .filter((item: any) => item.symbol.endsWith('USDT'))
      .map((item: any) => ({
        symbol: item.symbol.replace('USDT', ''),
        priceChangePercent: item.priceChangePercent,
        lastPrice: item.lastPrice,
        quoteVolume: parseFloat(item.quoteVolume)
      }))
      .filter((item: any) => 
        !STABLE_COINS.includes(item.symbol) && 
        !EXCLUDE_TOKENS.some(t => item.symbol.includes(t))
      )
      .sort((a: any, b: any) => b.quoteVolume - a.quoteVolume) // Sort by Volume (Liquidity)
      .slice(0, 30); // Top 30

    return filtered;
  } catch (error) {
    console.error("Market fetch error:", error);
    return [];
  }
};

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export const analyzeMarketOverview = async (): Promise<MarketOverviewResult> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const modelId = "gemini-2.5-flash";
  
  // 1. Get Real Data
  const marketData = await fetchTopMarketData();
  const btcData = marketData.find(c => c.symbol === 'BTC');
  
  if (marketData.length === 0) throw new Error("Không lấy được dữ liệu thị trường từ Binance.");

  // Simplify data for Prompt to save tokens
  const simplifiedData = marketData.map(c => `${c.symbol}: $${parseFloat(c.lastPrice).toFixed(2)} (${parseFloat(c.priceChangePercent).toFixed(2)}%)`).join('\n');

  const prompt = `
    Phân tích thị trường Crypto dựa trên Top 30 Coins theo Volume (Dữ liệu Real-time bên dưới).
    BTC Context: ${btcData ? `BTC đang giá ${btcData.lastPrice} (${btcData.priceChangePercent}%)` : 'N/A'}.

    DANH SÁCH COIN (Symbol: Price (24h%)):
    ${simplifiedData}

    YÊU CẦU:
    1. Xác định Xu hướng chung (Sentiment) của toàn market (Dựa trên sắc xanh/đỏ và BTC).
    2. Chọn ra 3 đồng coin "Spotlight" (Có cấu trúc đẹp nhất hoặc dòng tiền mạnh nhất) để Mua hoặc Short.
    3. Đánh giá nhanh các coin còn lại.

    TRẢ VỀ JSON DUY NHẤT:
    {
      "sentiment": "BULLISH" | "BEARISH" | "NEUTRAL",
      "sentimentScore": 0-100,
      "marketSummary": "Nhận định ngắn gọn về dòng tiền và BTC.",
      "spotlight": [
        { "symbol": "Mã", "price": "Giá", "change24h": "%", "signal": "BUY/SELL", "reason": "Lý do ngắn gọn" }
      ],
      "others": [
        { "symbol": "Mã", "price": "Giá", "change24h": "%", "signal": "BUY/SELL/WAIT", "reason": "Lý do ngắn gọn" }
         ... (Các coin còn lại trong danh sách)
      ]
    }
  `;

  try {
     const response = await ai.models.generateContent({
        model: modelId,
        contents: prompt,
        config: {
          responseMimeType: "application/json",
          systemInstruction: "Bạn là Market Scanner chuyên nghiệp. Hãy tìm kiếm cơ hội (Gems) trong danh sách được cung cấp. Ưu tiên cấu trúc giá và dòng tiền.",
        },
      });
      
      const text = response.text || "{}";
      return JSON.parse(text) as MarketOverviewResult;
  } catch (error) {
    console.error("AI Market Analysis failed:", error);
    throw new Error("Không thể phân tích tổng quan thị trường lúc này.");
  }
}

export const analyzeCrypto = async (symbol: string): Promise<{ data: AnalysisResult; sources: SourceLink[] }> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const modelId = "gemini-2.5-flash";

  const fullName = symbol === 'ICP' ? 'Internet Computer (ICP)' : symbol === 'BTC' ? 'Bitcoin (BTC)' : `${symbol}`;
  const now = new Date().toLocaleString('vi-VN');

  // 1. Fetch Real-time price (Parallel fetch if Altcoin to check BTC correlation)
  let realTimePrice: string | null = null;
  let btcPrice: string | null = null;

  if (symbol === 'BTC') {
    realTimePrice = await getRealtimePrice('BTC');
    btcPrice = realTimePrice;
  } else {
    // If analyzing Altcoin, fetch both Target Coin and BTC to ensure logic consistency
    const [targetPrice, bitcoinPrice] = await Promise.all([
      getRealtimePrice(symbol),
      getRealtimePrice('BTC')
    ]);
    realTimePrice = targetPrice;
    btcPrice = bitcoinPrice;
  }
  
  const priceContext = realTimePrice 
    ? `DỮ LIỆU GIÁ REAL-TIME (BẮT BUỘC DÙNG): ${symbol} = ${realTimePrice} USDT.` 
    : `Hãy tìm kiếm giá ${symbol} mới nhất từ Google Search.`;

  // Inject BTC Context for Altcoins
  const correlationContext = (symbol !== 'BTC' && btcPrice)
    ? `\nQUAN TRỌNG - MARKET CONTEXT: Giá Bitcoin (BTC) hiện tại là ${btcPrice} USDT. \nQUY TẮC BẮT BUỘC: Altcoin (${symbol}) thường chạy theo BTC. Nếu BTC đang xấu hoặc giảm, KHÔNG ĐƯỢC đưa tín hiệu BUY cho ${symbol} trừ khi có tin tức nội tại cực tốt (Independent Catalyst). Nếu BTC gãy trend, Altcoin phải giảm mạnh hơn.`
    : "";

  const systemInstruction = `Bạn là chuyên gia Crypto Analyst lão luyện (Conservative Trader).
  
  QUY TẮC BẤT DI BẤT DỊCH:
  1. Dữ liệu giá: Ưu tiên tuyệt đối giá Real-time được cung cấp.
  2. Logic tương quan (Correlation): BTC là King. Nếu Chart BTC xấu -> Altcoin auto xấu (Signal = SELL/WAIT). Không được "BTC Short" mà "Altcoin Long" trừ trường hợp đặc biệt (nhưng hiếm).
  3. Dữ liệu On-chain/News: Dùng Google Search để kiểm chứng.
  4. Output: Chỉ trả về JSON valid.`;

  const prompt = `
    Thời gian phân tích: ${now}.
    ${priceContext}
    ${correlationContext}
    
    Phân tích ${fullName} (${symbol}/USDT) cho Trader.

    BƯỚC 1: TÌM DỮ LIỆU (Google Search)
    - Tìm: Funding Rate, Fear & Greed Index (của Market/BTC), Netflow.
    - Kỹ thuật: RSI, EMA, Support/Resistance tại giá ${realTimePrice}.

    BƯỚC 2: TRẢ VỀ KẾT QUẢ JSON
    Trả về duy nhất 1 JSON object:
    {
      "currentPrice": "${realTimePrice ? `$${realTimePrice}` : 'Giá tìm được...'}",
      "timestamp": "${now}",
      "signal": "BUY" | "SELL" | "NEUTRAL" | "WAIT",
      "confidenceScore": số nguyên 0-100 (Nếu BTC xấu mà chart coin này đẹp, giảm score xuống vì rủi ro thị trường),
      "summary": "Nhận định xu hướng (Có nhắc đến tác động của BTC nếu là Altcoin).",
      "tradeSetup": {
        "entryZone": "Vùng giá Entry an toàn",
        "targetPrice": "Giá TP",
        "stopLoss": "Giá SL"
      },
      "technicalAnalysis": [
        { "name": "RSI/Indicator", "value": "Giá trị", "status": "BULLISH/BEARISH/NEUTRAL" },
        { "name": "Trend BTC (Market)", "value": "Xu hướng BTC", "status": "BULLISH/BEARISH/NEUTRAL" }, 
        { "name": "Support/Resistance", "value": "Vùng giá", "status": "NEUTRAL" }
      ],
      "onChainAnalysis": [
        { "name": "Fear & Greed", "value": "Giá trị", "description": "Tâm lý thị trường chung", "status": "POSITIVE/NEGATIVE/NEUTRAL" },
        { "name": "Dòng tiền/News", "value": "Tóm tắt", "description": "Tác động", "status": "POSITIVE/NEGATIVE/NEUTRAL" }
      ],
      "reasoning": [ "Lý do 1 (kỹ thuật)", "Lý do 2 (BTC context)", "Lý do 3 (Onchain)" ],
      "projectedTrend": [
        { "day": "Hôm nay", "price": ${realTimePrice || 'giá_hiện_tại'} },
        { "day": "+4H", "price": 0 },
        { "day": "+8H", "price": 0 },
        { "day": "+12H", "price": 0 },
        { "day": "+1D", "price": 0 },
        { "day": "+2D", "price": 0 },
        { "day": "+3D", "price": 0 }
      ]
    }
  `;

  // Implement Retry Logic
  let lastError: any;
  const maxRetries = 3;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const response = await ai.models.generateContent({
        model: modelId,
        contents: prompt,
        config: {
          systemInstruction: systemInstruction,
          tools: [{ googleSearch: {} }],
        },
      });

      const text = response.text || "";
      
      // Parse JSON
      let jsonString = text;
      const jsonMatch = text.match(/```json\s*([\s\S]*?)\s*```/) || text.match(/```\s*([\s\S]*?)\s*```/);
      if (jsonMatch) {
        jsonString = jsonMatch[1];
      } else {
         const firstBrace = text.indexOf('{');
         const lastBrace = text.lastIndexOf('}');
         if (firstBrace !== -1 && lastBrace !== -1) {
           jsonString = text.substring(firstBrace, lastBrace + 1);
         }
      }

      const data: AnalysisResult = JSON.parse(jsonString);
      
      // Extract sources
      const groundingChunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks || [];
      const sources: SourceLink[] = groundingChunks
        .filter((chunk: any) => chunk.web?.uri && chunk.web?.title)
        .map((chunk: any) => ({
          title: chunk.web.title,
          uri: chunk.web.uri,
        }));

      // Override price to ensure accuracy
      if (realTimePrice) {
         data.currentPrice = `$${realTimePrice}`;
         if (data.projectedTrend && data.projectedTrend.length > 0) {
           data.projectedTrend[0].price = parseFloat(realTimePrice);
         }
      }

      return { data, sources };

    } catch (error: any) {
      console.warn(`Attempt ${attempt} failed:`, error);
      lastError = error;
      
      if (attempt < maxRetries) {
        await delay(1000 * Math.pow(2, attempt - 1));
      }
    }
  }

  let errorMessage = "Không thể phân tích dữ liệu lúc này. Vui lòng thử lại.";
  if (lastError) {
    try {
       if (typeof lastError.message === 'string') {
          if (lastError.message.includes("Rpc failed") || lastError.message.includes("500")) {
            errorMessage = "Hệ thống AI đang quá tải (Google 500 Error). Đang tự động thử lại...";
          } else if (lastError.message.startsWith('{')) {
             const errorObj = JSON.parse(lastError.message);
             errorMessage = `Lỗi API: ${errorObj.error?.message || "Unknown Error"}`;
          } else {
             errorMessage = lastError.message;
          }
       }
    } catch (e) {
      errorMessage = lastError.message || errorMessage;
    }
  }

  throw new Error(errorMessage);
};
