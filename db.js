import mysql from 'mysql2';
import dotenv from 'dotenv';
dotenv.config();

const connectionConfig = process.env.DATABASE_URL
  ? {
      // Если есть DATABASE_URL, используем её (например, Railway)
      uri: process.env.DATABASE_URL,
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0
    }
  : {
      // Если DATABASE_URL нет — локальное подключение
      host: 'localhost',
      user: 'root',
      password: '36yP42yT',
      database: 'computer_club',
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0
    };

const db = mysql.createPool(connectionConfig);

export default db;
