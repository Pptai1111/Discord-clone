import { NextApiRequest, NextApiResponse } from 'next';
import { createCanvas } from 'canvas';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const { source, videoId } = req.query;
    
    if (!source) {
      return res.status(400).json({ error: 'Source parameter is required' });
    }
    
    // Tạo thumbnail cho từng loại source
    const canvas = createCanvas(480, 360);
    const ctx = canvas.getContext('2d');
    
    // Đặt background color dựa trên source
    switch (source) {
      case 'youtube':
        ctx.fillStyle = '#FF0000';
        break;
      case 'vimeo':
        ctx.fillStyle = '#1AB7EA';
        break;
      case 'facebook':
        ctx.fillStyle = '#3B5998';
        break;
      case 'twitch':
        ctx.fillStyle = '#6441A4';
        break;
      default:
        ctx.fillStyle = '#282828';
    }
    
    // Vẽ background
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    // Vẽ logo
    ctx.fillStyle = '#FFFFFF';
    ctx.font = 'bold 36px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    
    let icon = '';
    switch (source) {
      case 'youtube':
        icon = 'YouTube';
        break;
      case 'vimeo':
        icon = 'Vimeo';
        break;
      case 'facebook':
        icon = 'Facebook';
        break;
      case 'twitch':
        icon = 'Twitch';
        break;
      default:
        icon = 'Video';
    }
    
    ctx.fillText(icon, canvas.width / 2, canvas.height / 2 - 20);
    
    // Vẽ video ID nếu có
    if (videoId) {
      ctx.font = '20px Arial';
      ctx.fillText(videoId.toString().substring(0, 20), canvas.width / 2, canvas.height / 2 + 30);
    }
    
    // Vẽ watermark
    ctx.font = '16px Arial';
    ctx.fillText('Watch Together', canvas.width / 2, canvas.height - 30);
    
    // Trả về buffer
    const buffer = canvas.toBuffer('image/png');
    
    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    return res.send(buffer);
    
  } catch (error) {
    console.error('Error generating thumbnail:', error);
    
    // Fallback: trả về hình ảnh cơ bản
    const canvas = createCanvas(480, 360);
    const ctx = canvas.getContext('2d');
    
    ctx.fillStyle = '#333';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    ctx.fillStyle = '#FFFFFF';
    ctx.font = 'bold 32px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('Video Thumbnail', canvas.width / 2, canvas.height / 2);
    
    const buffer = canvas.toBuffer('image/png');
    
    res.setHeader('Content-Type', 'image/png');
    return res.send(buffer);
  }
} 