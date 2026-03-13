import sqlite3 from 'sqlite3';
import { config } from '../config';

const db = new sqlite3.Database(config.DB_PATH, (err) => {
  if (err) {
    console.error('Error connecting to database:', err.message);
  } else {
    console.log(`Connected to the SQLite database at ${config.DB_PATH}.`);
  }
});

export const initDb = () => {
  return new Promise<void>((resolve, reject) => {
    // Users table for settings
    db.run(`CREATE TABLE IF NOT EXISTS users (
      chat_id INTEGER PRIMARY KEY,
      margin_per_entry REAL DEFAULT 0.01,
      auto_tp_percent REAL DEFAULT 100,
      auto_sl_percent REAL DEFAULT 50,
      is_copy_trading BOOLEAN DEFAULT 0,
      target_wallet TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`, (err) => {
      if (err) return reject(err);

      // Trades table for tracking active positions
      db.run(`CREATE TABLE IF NOT EXISTS trades (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        chat_id INTEGER,
        token_address TEXT,
        entry_price REAL,
        entry_amount_sol REAL,
        entry_amount_token REAL,
        tx_signature TEXT,
        status TEXT DEFAULT 'OPEN', -- OPEN, CLOSED_TP, CLOSED_SL, CLOSED_MANUAL
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`, (err) => {
        if (err) return reject(err);
        resolve();
      });
    });
  });
};

export default db;
