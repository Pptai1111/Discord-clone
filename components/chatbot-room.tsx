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
  },
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
    
    // Lấy danh sách giọng
    const voices = window.speechSynthesis.getVoices();
    if (voices.length > 0) {
      // Tìm giọng phù hợp
      const preferredVoice = character.preferredVoice === 'female' 
        ? voices.find(v => v.name.includes('Female') || v.name.includes('female'))
        : voices.find(v => v.name.includes('Male') || v.name.includes('male'));
        
      if (preferredVoice) utterance.voice = preferredVoice;
    }
    
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
    <div className="flex flex-col h-full bg-zinc-900 overflow-hidden">
      {/* Header */}
      <div className="bg-zinc-800 p-3 flex items-center justify-between">
        <div className="flex items-center">
          <h2 className="text-zinc-100 font-semibold">{character.name}</h2>
          <span className="text-zinc-400 text-xs ml-2">{character.description}</span>
        </div>
        <div className="flex items-center gap-2">
          <Button 
            variant="ghost" 
            size="icon"
            className="h-8 w-8"
            onClick={() => setSpeechEnabled(!speechEnabled)}
            title={speechEnabled ? "Tắt giọng nói" : "Bật giọng nói"}
          >
            {speechEnabled ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
          </Button>
          <select 
            className="bg-zinc-700 text-zinc-200 rounded px-2 py-1 text-sm"
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
      <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
        {/* Character Display */}
        <div className="h-64 md:h-auto md:w-1/3 bg-zinc-950 flex items-center justify-center p-4 relative">
          <div className={`transition-all duration-300 ${isSpeaking ? 'scale-105' : 'scale-100'}`}>
            <img 
              src={getAvatarUrl(currentEmotion)} 
              alt={`${character.name} feeling ${currentEmotion}`}
              className="max-h-full max-w-full object-contain"
            />
          </div>
        </div>
        
        {/* Chat Display */}
        <div className="flex-1 flex flex-col md:border-l border-zinc-800 overflow-hidden">
          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {messages.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-zinc-500">
                <Bot className="h-10 w-10 mb-2 text-zinc-600" />
                <p className="text-sm">Hãy bắt đầu cuộc trò chuyện với {character.name}</p>
              </div>
            ) : (
              messages.map((message) => (
                <div 
                  key={message.id}
                  className={cn(
                    "flex items-start gap-3 max-w-[85%]",
                    message.role === 'user' ? "ml-auto" : "mr-auto"
                  )}
                >
                  {message.role !== 'user' && (
                    <div 
                      className="h-8 w-8 rounded-full overflow-hidden bg-zinc-800 flex-shrink-0"
                      style={{
                        backgroundImage: `url(${getAvatarUrl(message.emotion || 'neutral')})`,
                        backgroundSize: 'cover',
                        backgroundPosition: 'center top'
                      }}
                    />
                  )}
                  
                  <div
                    className={cn(
                      "p-3 rounded-lg text-sm",
                      message.role === 'user' 
                        ? "bg-indigo-600 text-white" 
                        : "bg-zinc-800 text-zinc-200"
                    )}
                  >
                    {message.content}
                  </div>
                  
                  {message.role === 'user' && (
                    <div 
                      className="h-8 w-8 rounded-full overflow-hidden bg-zinc-700 flex-shrink-0"
                      style={{
                        backgroundImage: `url(${member?.profile?.imageUrl})`,
                        backgroundSize: 'cover',
                        backgroundPosition: 'center'
                      }}
                    />
                  )}
                </div>
              ))
            )}
            
            {isLoading && (
              <div className="flex items-start gap-3 max-w-[85%] mr-auto">
                <div 
                  className="h-8 w-8 rounded-full overflow-hidden bg-zinc-800 flex-shrink-0"
                  style={{
                    backgroundImage: `url(${getAvatarUrl('neutral')})`,
                    backgroundSize: 'cover',
                    backgroundPosition: 'center top'
                  }}
                />
                <div className="p-3 rounded-lg text-sm bg-zinc-800 text-zinc-200">
                  <Loader2 className="h-4 w-4 animate-spin" />
                </div>
              </div>
            )}
            
            <div ref={endOfMessagesRef} />
          </div>
          
          {/* Input */}
          <div className="p-3 border-t border-zinc-800">
            <form onSubmit={handleSendMessage} className="flex items-center gap-2">
              <Input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder={`Nhắn tin với ${character.name}...`}
                className="bg-zinc-800 border-zinc-700"
                disabled={isLoading}
              />
              <Button 
                type="submit" 
                disabled={isLoading || !input.trim()}
                className="bg-indigo-600 hover:bg-indigo-700"
              >
                {isLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
              </Button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}; 