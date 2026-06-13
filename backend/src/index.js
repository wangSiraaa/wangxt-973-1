import { createApp } from './app.js';

const PORT = process.env.PORT || 3001;

(async () => {
  const app = await createApp();
  app.listen(PORT, () => {
    console.log(`🏊 水上乐园储物柜系统后端已启动`);
    console.log(`📡 API服务: http://localhost:${PORT}/api`);
    console.log(`🩺 健康检查: http://localhost:${PORT}/api/health`);
  });
})();
