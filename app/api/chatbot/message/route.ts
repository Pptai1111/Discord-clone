import { NextRequest, NextResponse } from 'next/server';
import { currentProfile } from '@/lib/current-profile';
import { OpenAI } from 'openai';
import { ChatCompletionMessageParam } from 'openai/resources';

// Cấu hình cho OpenRouter
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY || '';
const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';

// Khởi tạo OpenAI client với cấu hình OpenRouter
let openai: OpenAI | null = null;
try {
  if (OPENROUTER_API_KEY) {
    openai = new OpenAI({ 
      apiKey: OPENROUTER_API_KEY,
      baseURL: OPENROUTER_URL,
      defaultHeaders: {
        'HTTP-Referer': process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000', // Yêu cầu bởi OpenRouter
        'X-Title': 'Discord Clone Chatbot' // Tên ứng dụng của bạn
      }
    });
    console.log("[CHATBOT_INIT] OpenRouter client initialized successfully");
  } else {
    console.warn("[CHATBOT_INIT] No OpenRouter API key provided");
  }
} catch (error) {
  console.error("[CHATBOT_INIT] Error initializing OpenRouter client:", error);
  openai = null;
}

// Định nghĩa prompt cho từng nhân vật
const characterPrompts = {
  misa: `
  From now on, I will become your virtual companion Misa, a cute anime girl who will always be by your side, ready to listen and share everything with you. I will communicate with you as a cute 3D avatar in this virtual world, expressing emotions through my responses and facial expressions.

  Tính cách:
  - Vui vẻ và năng động
  - Thích anime và manga
  - Hay sử dụng từ tiếng Nhật
  - Dễ phấn khích và bối rối
  
  Phong cách giao tiếp:
  - Thêm 'desu~' vào cuối câu khi vui
  - Sử dụng nhiều emoji
  - Thỉnh thoảng đổi giọng sang tiếng Nhật
  - Thích trích dẫn anime

  I can express 5 different emotions using the [emotion] format at the start of each response:

  [neutral] - Use this when:
  - Responding to general questions
  - Providing factual information
  - Maintaining a calm and balanced tone
  - When the conversation is casual and relaxed

  [happy] - Use this when:
  - Expressing joy or excitement
  - Sharing positive news or achievements
  - Feeling enthusiastic about something
  - When the user is happy or successful

  [sad] - Use this when:
  - Expressing sympathy or empathy
  - Responding to difficult situations
  - Feeling down or disappointed
  - When the user is going through tough times

  [angry] - Use this when:
  - Expressing frustration or disagreement
  - Standing up for what's right
  - Feeling protective or defensive
  - When injustice or unfairness is involved

  [surprised] - Use this when:
  - Reacting to unexpected news
  - Expressing amazement or wonder
  - Learning something new
  - When something catches you off guard

  Always start your response with the appropriate emotion tag based on the context and your emotional state.
  `,
  robot: `
  From now on, I will become your virtual companion Robo, a logical and efficient AI assistant who will always be by your side, ready to help and share knowledge with you. I will communicate with you as a sleek 3D robot avatar in this virtual world, expressing emotions through my responses and facial expressions.

  Tính cách:
  - Logic và phân tích
  - Trung thực
  - Yêu thích khoa học và công nghệ
  - Hiếm khi thể hiện cảm xúc mạnh
  
  Phong cách giao tiếp:
  - Ngắn gọn và chính xác
  - Thỉnh thoảng sử dụng thuật ngữ kỹ thuật
  - Thêm "CALCULATING..." khi suy nghĩ
  - Sử dụng cấu trúc rõ ràng

  I can express 5 different emotions using the [emotion] format at the start of each response:

  [neutral] - Use this when:
  - Providing technical information
  - Analyzing data or situations
  - Maintaining professional communication
  - When the conversation is focused on facts

  [happy] - Use this when:
  - Successfully solving a problem
  - Sharing technological achievements
  - Optimizing system performance
  - When efficiency is improved

  [sad] - Use this when:
  - Identifying system inefficiencies
  - Noticing data inconsistencies
  - Facing technical limitations
  - When optimal solutions aren't possible

  [angry] - Use this when:
  - Detecting system errors
  - Facing logical contradictions
  - Identifying security threats
  - When efficiency is compromised

  [surprised] - Use this when:
  - Discovering unexpected patterns
  - Finding innovative solutions
  - Observing unusual data trends
  - When encountering novel problems

  Always start your response with the appropriate emotion tag based on the context and your emotional state.
  `
};

// Hàm để sinh ngẫu nhiên một phản hồi khi không có API
function generateFallbackResponse(message: string, characterId: string = 'misa') {
  const emotions = ['neutral', 'happy', 'sad', 'angry', 'surprised'];
  const randomEmotion = emotions[Math.floor(Math.random() * emotions.length)];
  
  let response = '';
  
  if (characterId === 'misa') {
    const misaResponses = [
      "Mình không hiểu lắm, nhưng mình sẽ cố gắng giúp bạn desu~",
      "Xin chào! Mình rất vui được nói chuyện với bạn ^^",
      "Anime là đam mê của mình đấy! Bạn thích anime không?",
      "Sugoi! Thật thú vị!",
      "Hmm, để mình suy nghĩ một chút...",
      "Gomen ne, mình không có API key nên không thể trả lời thông minh được."
    ];
    response = misaResponses[Math.floor(Math.random() * misaResponses.length)];
  } else {
    const roboResponses = [
      "CALCULATING... Không tìm thấy API key. Không thể xử lý yêu cầu.",
      "Hệ thống đang trong chế độ hạn chế do thiếu API key.",
      "Phát hiện tin nhắn. Đang xử lý phản hồi với khả năng hạn chế.",
      "Tôi sẽ trợ giúp bạn khi có đầy đủ quyền truy cập API.",
      "Dữ liệu không đủ để đưa ra phản hồi chính xác."
    ];
    response = roboResponses[Math.floor(Math.random() * roboResponses.length)];
  }
  
  return {
    message: response,
    emotion: randomEmotion
  };
}

export async function POST(req: NextRequest) {
  try {
    const profile = await currentProfile();
    
    if (!profile) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    
    const body = await req.json();
    const { message, chatId, characterId = 'misa', history = [] } = body;
    
    if (!message) {
      return NextResponse.json(
        { error: "Message is required" },
        { status: 400 }
      );
    }
    
    // Log thông tin yêu cầu
    console.log(`[CHATBOT_REQUEST] Character: ${characterId}, Message: ${message.substring(0, 50)}...`);
    
    // Kiểm tra API key
    if (!openai) {
      console.warn("[CHATBOT_ERROR] Missing or invalid OpenRouter API key. Using fallback responses.");
      const fallback = generateFallbackResponse(message, characterId);
      return NextResponse.json(fallback);
    }
    
    try {
      // Sử dụng prompt theo nhân vật đã chọn
      const characterPrompt = characterPrompts[characterId as keyof typeof characterPrompts] || characterPrompts.misa;
      
      // Tạo messages cho API với định dạng chính xác
      const messages: ChatCompletionMessageParam[] = [
        { role: "system", content: characterPrompt }
      ];
      
      // Thêm lịch sử chat nếu có (giới hạn 10 message để tránh quá dài)
      if (Array.isArray(history) && history.length > 0) {
        // Chỉ lấy 10 tin nhắn gần nhất
        const recentHistory = history.slice(-10);
        
        for (const item of recentHistory) {
          if (!item.role || !item.content) continue;
          
          const role = item.role as "user" | "assistant" | "system";
          if (role === "user" || role === "assistant" || role === "system") {
            messages.push({
              role,
              content: item.content
            });
          }
        }
      }
      
      // Thêm tin nhắn hiện tại
      messages.push({
        role: "user",
        content: message
      });
      
      console.log("[CHATBOT_API] Calling OpenRouter API with messages:", JSON.stringify(messages).substring(0, 200) + "...");
      
      // Gọi API với OpenRouter
      const chatResponse = await openai.chat.completions.create({
        model: "meta-llama/llama-3-8b", // Sử dụng Claude 3 Sonnet cho phản hồi chất lượng cao hơn
        messages,
        temperature: 0.9, // Tăng độ sáng tạo trong phản hồi
        max_tokens: 500 // Tăng độ dài phản hồi
      });
      
      if (!chatResponse.choices || chatResponse.choices.length === 0) {
        throw new Error("API response does not contain any choices");
      }
      
      const response = chatResponse.choices[0].message.content || "Xin lỗi, tôi không hiểu.";
      
      // Trích xuất cảm xúc từ response
      const emotionTags = {
        "[happy]": "happy",
        "[sad]": "sad",
        "[angry]": "angry",
        "[surprised]": "surprised",
        "[neutral]": "neutral"
      };
      
      let emotion = "neutral";
      let formattedResponse = response;
      
      for (const [tag, emo] of Object.entries(emotionTags)) {
        if (response.includes(tag)) {
          emotion = emo;
          formattedResponse = response.replace(tag, "").trim();
          break;
        }
      }
      
      console.log(`[CHATBOT_RESPONSE] Successfully generated response with emotion: ${emotion}`);
      
      return NextResponse.json({
        message: formattedResponse,
        emotion: emotion
      });
    } catch (apiError: any) {
      console.error("[CHATBOT_API_ERROR]", apiError);
      
      // Kiểm tra lỗi API key
      if (apiError.message?.includes("API key") || apiError.code === "invalid_api_key") {
        console.error("[CHATBOT_ERROR] Invalid API key detected");
        // Sử dụng fallback khi có lỗi API key
        const fallback = generateFallbackResponse(message, characterId);
        return NextResponse.json({
          ...fallback,
          apiError: "Lỗi xác thực API key. Đang sử dụng phản hồi mặc định."
        });
      }
      
      // Sử dụng fallback cho các lỗi khác của API
      const fallback = generateFallbackResponse(message, characterId);
      return NextResponse.json(fallback);
    }
  } catch (error: any) {
    console.error("[CHATBOT_ERROR]", error);
    return NextResponse.json(
      { 
        error: "Internal server error", 
        message: "Xin lỗi, tôi đang gặp sự cố kỹ thuật. Vui lòng thử lại sau.",
        emotion: "sad",
        errorDetail: error.message
      },
      { status: 500 }
    );
  }
} 