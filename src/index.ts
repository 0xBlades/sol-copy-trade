import { initDb } from './database';
import { bot } from './bot';
import { startCopyTradeDaemon } from './services/copyTrade';
import { startMonitorDaemon } from './services/monitor';

async function bootstrap() {
  console.log("Starting Solana Copy Trade Bot...");
  
  try {
    // Initialize Database
    await initDb();
    console.log("Database initialized.");

    // Start background services
    startCopyTradeDaemon();
    startMonitorDaemon();

    // Launch Telegram Bot
    bot.launch(() => {
        console.log("Telegram Bot started!");
    });

    // Enable graceful stop
    process.once('SIGINT', () => bot.stop('SIGINT'));
    process.once('SIGTERM', () => bot.stop('SIGTERM'));
  } catch (error) {
    console.error("Failed to start the application:", error);
    process.exit(1);
  }
}

bootstrap();
