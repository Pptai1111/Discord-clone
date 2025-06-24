'use client'

import { useState, useEffect, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Loader2, Send, Volume2, VolumeX, Bot } from 'lucide-react'
import axios from 'axios'
import { useRouter } from 'next/navigation'
import { cn } from '@/lib/utils'

// Định nghĩa character mặc định
const DEFAULT_CHARACTERS = [
  {
    id: 'robot',
    name: 'Robo',
    description: 'Robot thông minh',
    avatars: {
      neutral: '/characters/robot/neutral.png',
      happy: '/characters/robot/happy.png',
      sad: '/characters/robot/sad.png',
      angry: '/characters/robot/angry.png',
      surprised: '/characters/robot/surprised.png',
    },
    speechRate: 0.9,
    speechPitch: 0.8,
    preferredVoice: 'male'
  },
  {
    id: 'misa',
    name: 'Misa',
    description: 'Trợ lý anime vui vẻ',
    avatars: {
      neutral: '/characters/misa/neutral.png',
      happy: '/characters/misa/happy.png',
      sad: '/characters/misa/sad.png',
      angry: '/characters/misa/angry.png',
      surprised: '/characters/misa/surprised.png',
    },
    speechRate: 1.1,
    speechPitch: 1.2,
    preferredVoice: 'female'
  }
];

// Fallback images khi chưa có assets
const FALLBACK_AVATARS = {
  neutral: 'https://raw.githubusercontent.com/Pptai1111/ChatVRM/main/public/fallback.png',
  happy: 'https://raw.githubusercontent.com/Pptai1111/ChatVRM/main/public/fallback-happy.png',
  sad: 'https://raw.githubusercontent.com/Pptai1111/ChatVRM/main/public/fallback-sad.png',
  angry: 'https://raw.githubusercontent.com/Pptai1111/ChatVRM/main/public/fallback-angry.png',
  surprised: 'https://raw.githubusercontent.com/Pptai1111/ChatVRM/main/public/fallback-surprised.png',
};

interface Member {
  id: string;
  role: string;
  profileId?: string;
  profile?: {
    name: string;
    imageUrl: string;
  }
}

interface ChatbotRoomProps {
  chatId: string;
  member: Member;
}

export const ChatbotRoom = ({ chatId, member }: ChatbotRoomProps) => {
  const router = useRouter();
  const [messages, setMessages] = useState<any[]>([]);
  const [input, setInput] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [character, setCharacter] = useState(DEFAULT_CHARACTERS[0]);
  const [currentEmotion, setCurrentEmotion] = useState<string>('neutral');
  const [isSpeaking, setIsSpeaking] = useState<boolean>(false);
  const [speechEnabled, setSpeechEnabled] = useState<boolean>(false);
  const [assetsReady, setAssetsReady] = useState<boolean>(false);
  
  const endOfMessagesRef = useRef<HTMLDivElement>(null);
  
  // Sử dụng fallback hoặc custom avatars
  const getAvatarUrl = (emotion: string) => {
    if (assetsReady) {
      return character.avatars[emotion as keyof typeof character.avatars] || character.avatars.neutral;
    }
    return FALLBACK_AVATARS[emotion as keyof typeof FALLBACK_AVATARS] || FALLBACK_AVATARS.neutral;
  };
  
  // Kiểm tra hình ảnh có tồn tại không
  useEffect(() => {
    const checkAssetsExist = async () => {
      try {
        const checkImage = (url: string) => {
          return new Promise((resolve) => {
            const img = new Image();
            img.onload = () => resolve(true);
            img.onerror = () => resolve(false);
            img.src = url;
          });
        };
        
        const neutralExists = await checkImage(character.avatars.neutral);
        setAssetsReady(neutralExists as boolean);
      } catch (e) {
        setAssetsReady(false);
      }
    };
    
    checkAssetsExist();
  }, [character]);
  
  // Lưu và tải tin nhắn từ localStorage
  useEffect(() => {
    const savedMessages = localStorage.getItem(`chatbot_${chatId}`);
    if (savedMessages) {
      try {
        setMessages(JSON.parse(savedMessages));
      } catch (e) {
        console.error('Error loading messages:', e);
      }
    }
  }, [chatId]);
  
  useEffect(() => {
    if (messages.length > 0) {
      localStorage.setItem(`chatbot_${chatId}`, JSON.stringify(messages));
      endOfMessagesRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, chatId]);
  
  // Text-to-Speech function
  const speakText = (text: string) => {
    if (!speechEnabled || !window.speechSynthesis) return;
    
    // Dừng nếu đang nói
    window.speechSynthesis.cancel();
    
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = character.speechRate || 1;
    utterance.pitch = character.speechPitch || 1;
    
    // Luôn chọn voice nữ (bỏ gender, chỉ check name/voiceURI)
    const voices = window.speechSynthesis.getVoices();
    const femaleVoice = voices.find(v =>
      v.name.toLowerCase().includes('female') ||
      v.name.toLowerCase().includes('woman') ||
      v.name.toLowerCase().includes('girl') ||
      v.voiceURI.toLowerCase().includes('female')
    );
    if (femaleVoice) utterance.voice = femaleVoice;
    
    // Sự kiện bắt đầu/kết thúc nói
    utterance.onstart = () => setIsSpeaking(true);
    utterance.onend = () => setIsSpeaking(false);
    
    window.speechSynthesis.speak(utterance);
  };
  
  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!input.trim() || isLoading) return;
    
    // Thêm tin nhắn người dùng
    const userMessage = {
      id: Date.now().toString(),
      content: input,
      role: 'user',
      sender: member?.profile?.name || 'User',
      timestamp: new Date().toISOString()
    };
    
    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);
    
    try {
      // Gửi tin nhắn đến API
      const response = await axios.post('/api/chatbot/message', {
        message: input,
        chatId,
        characterId: character.id,
        history: messages.slice(-5).map(m => ({
          role: m.role,
          content: m.content
        }))
      });
      
      const { message, emotion } = response.data;
      
      // Thêm tin nhắn bot
      const botMessage = {
        id: (Date.now() + 1).toString(),
        content: message,
        role: 'assistant',
        sender: character.name,
        emotion: emotion || 'neutral',
        timestamp: new Date().toISOString()
      };
      
      setMessages(prev => [...prev, botMessage]);
      setCurrentEmotion(emotion || 'neutral');
      
      // Đọc tin nhắn nếu đã bật
      if (speechEnabled) {
        speakText(message);
      }
    } catch (error) {
      console.error('Error sending message:', error);
      
      // Thêm tin nhắn lỗi
      const errorMessage = {
        id: (Date.now() + 1).toString(),
        content: 'Xin lỗi, tôi đang gặp sự cố kỹ thuật. Vui lòng thử lại sau.',
        role: 'assistant',
        sender: character.name,
        emotion: 'sad',
        timestamp: new Date().toISOString()
      };
      
      setMessages(prev => [...prev, errorMessage]);
      setCurrentEmotion('sad');
    } finally {
      setIsLoading(false);
    }
  };
  
  // Chuyển đổi nhân vật
  const switchCharacter = (characterId: string) => {
    const newCharacter = DEFAULT_CHARACTERS.find(c => c.id === characterId);
    if (newCharacter) {
      setCharacter(newCharacter);
      setCurrentEmotion('neutral');
    }
  };
  
  return (
    <div className="flex flex-col h-full min-h-screen bg-background bg-cover bg-center font-['Quicksand',_sans-serif] relative">
      {/* Nền mờ, có thể thêm hình nền nếu muốn */}
      <div className="absolute inset-0 z-0 opacity-40 bg-[url('/bg-otome.jpg')] bg-cover bg-center pointer-events-none dark:opacity-20" />
      {/* Header */}
      <div className="relative z-10 flex items-center justify-between px-6 py-4 bg-white/70 dark:bg-zinc-900/80 shadow-lg border-b border-border rounded-b-3xl">
        <div className="flex items-center gap-4">
          <div className={`relative h-20 w-20 rounded-full border-4 border-pink-300 dark:border-indigo-700 shadow-xl bg-white dark:bg-zinc-900 flex items-center justify-center transition-all duration-300 ${isSpeaking ? 'scale-110 ring-4 ring-pink-200/60 dark:ring-indigo-400/60' : ''}`}> 
            <img
              src={getAvatarUrl(currentEmotion)}
              alt={character.name}
              className="h-16 w-16 object-contain rounded-full"
            />
          </div>
          <div>
            <div className="text-2xl font-extrabold text-pink-500 dark:text-indigo-300 drop-shadow-sm tracking-wide" style={{ letterSpacing: '0.04em' }}>{character.name}</div>
            <div className="text-sm text-indigo-400 dark:text-zinc-300 italic">{character.description}</div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            className="h-10 w-10"
            onClick={() => setSpeechEnabled(!speechEnabled)}
            title={speechEnabled ? "Tắt giọng nói" : "Bật giọng nói"}
          >
            {speechEnabled ? <Volume2 className="h-6 w-6 text-pink-400 dark:text-indigo-300" /> : <VolumeX className="h-6 w-6 text-indigo-300 dark:text-pink-400" />}
          </Button>
          <select
            className="bg-pink-100 dark:bg-zinc-800 text-pink-600 dark:text-indigo-200 rounded px-3 py-1 text-base border border-pink-300 dark:border-indigo-700 focus:outline-none focus:ring-2 focus:ring-pink-200 dark:focus:ring-indigo-400 shadow"
            value={character.id}
            onChange={(e) => switchCharacter(e.target.value)}
          >
            {DEFAULT_CHARACTERS.map(char => (
              <option key={char.id} value={char.id}>{char.name}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Main Content */}
      <div className="relative z-10 flex-1 flex flex-col md:flex-row overflow-hidden">
        {/* Avatar nhân vật lớn (Otome style) */}
        <div className="hidden md:flex md:w-1/3 items-end justify-center p-6 relative">
          <div className={`transition-all duration-300 ${isSpeaking ? 'scale-110' : 'scale-100'}`}> 
            <img
              src={getAvatarUrl(currentEmotion)}
              alt={`${character.name} feeling ${currentEmotion}`}
              className="h-72 w-72 object-contain rounded-3xl shadow-2xl border-4 border-pink-200 dark:border-indigo-700 bg-white dark:bg-zinc-900"
              style={{ boxShadow: '0 8px 32px 0 rgba(255,182,193,0.15)' }}
            />
          </div>
        </div>

        {/* Chat Display */}
        <div className="flex-1 flex flex-col border-l border-border bg-white/60 dark:bg-zinc-900/60">
          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-8 space-y-8 custom-scrollbar">
            {messages.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-indigo-400 dark:text-indigo-200">
                <Bot className="h-14 w-14 mb-3 text-pink-300/70 dark:text-indigo-400/70" />
                <p className="text-lg">Hãy bắt đầu cuộc trò chuyện với <span className="text-pink-500 dark:text-indigo-300 font-bold">{character.name}</span></p>
              </div>
            ) : (
              messages.map((message) => (
                message.role === 'assistant' ? (
                  <div key={message.id} className="flex flex-col items-start max-w-2xl">
                    {/* Khung thoại Otome */}
                    <div className="relative mb-2">
                      <div className="absolute -top-8 left-4 bg-pink-200 dark:bg-indigo-800 px-4 py-1 rounded-full text-pink-700 dark:text-indigo-100 font-bold shadow text-base border border-pink-300 dark:border-indigo-700" style={{ letterSpacing: '0.04em' }}>{character.name}</div>
                      <div className="px-6 py-5 rounded-3xl bg-white/90 dark:bg-zinc-900/90 border-2 border-pink-200 dark:border-indigo-700 shadow-xl text-lg text-indigo-700 dark:text-indigo-100 font-medium min-w-[220px] max-w-xl" style={{ boxShadow: '0 4px 24px 0 rgba(255,182,193,0.10)' }}>
                        {message.content}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div key={message.id} className="flex flex-col items-end max-w-2xl ml-auto">
                    <div className="px-6 py-5 rounded-3xl bg-indigo-200/80 dark:bg-pink-900/60 border-2 border-indigo-300 dark:border-pink-700 shadow text-lg text-indigo-900 dark:text-pink-100 font-medium min-w-[120px] max-w-xl">
                      {message.content}
                    </div>
                  </div>
                )
              ))
            )}
            {isLoading && (
              <div className="flex flex-col items-start max-w-2xl">
                <div className="absolute -top-8 left-4 bg-pink-200 dark:bg-indigo-800 px-4 py-1 rounded-full text-pink-700 dark:text-indigo-100 font-bold shadow text-base border border-pink-300 dark:border-indigo-700">{character.name}</div>
                <div className="px-6 py-5 rounded-3xl bg-white/90 dark:bg-zinc-900/90 border-2 border-pink-200 dark:border-indigo-700 shadow-xl text-lg text-indigo-700 dark:text-indigo-100 font-medium min-w-[220px] max-w-xl flex items-center gap-2">
                  <Loader2 className="h-5 w-5 animate-spin text-pink-400 dark:text-indigo-300" /> Đang trả lời...
                </div>
              </div>
            )}
            <div ref={endOfMessagesRef} />
          </div>

          {/* Input */}
          <div className="relative z-20 p-6 border-t border-border bg-white/80 dark:bg-zinc-900/80 rounded-t-3xl shadow-xl">
            <form onSubmit={handleSendMessage} className="flex items-center gap-4">
              <Input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder={`Nhắn tin với ${character.name}...`}
                className="bg-pink-50 dark:bg-zinc-800 border border-pink-200 dark:border-indigo-700 text-indigo-700 dark:text-indigo-100 placeholder:text-pink-300 dark:placeholder:text-indigo-400 focus:ring-2 focus:ring-pink-200 dark:focus:ring-indigo-400 focus:border-pink-300 dark:focus:border-indigo-700 rounded-2xl px-6 py-3 text-lg shadow"
                disabled={isLoading}
                autoFocus
              />
              <Button
                type="submit"
                disabled={isLoading || !input.trim()}
                className="bg-gradient-to-r from-pink-400 to-indigo-300 dark:from-indigo-700 dark:to-pink-400 hover:from-pink-500 hover:to-indigo-400 dark:hover:from-indigo-800 dark:hover:to-pink-500 text-white rounded-full h-14 w-14 flex items-center justify-center shadow-xl text-xl"
              >
                {isLoading ? (
                  <Loader2 className="h-6 w-6 animate-spin" />
                ) : (
                  <Send className="h-6 w-6" />
                )}
              </Button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
};