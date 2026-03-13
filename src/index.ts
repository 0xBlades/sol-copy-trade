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

    // Drop any pending Telegram updates before starting (prevents 409 conflict)
    try {
      await bot.telegram.deleteWebhook({ drop_pending_updates: true });
      console.log("Cleared pending Telegram updates.");
    } catch (e) {
      console.warn("Could not clear pending updates:", e);
    }

    // Launch Telegram Bot with drop_pending_updates to avoid 409 conflict
    bot.launch({
      dropPendingUpdates: true,
    });
    console.log("Telegram Bot started!");

    // Enable graceful stop
    process.once('SIGINT', () => bot.stop('SIGINT'));
    process.once('SIGTERM', () => bot.stop('SIGTERM'));
  } catch (error) {
    console.error("Failed to start the application:", error);
    process.exit(1);
  }
}

bootstrap();
