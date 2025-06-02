import mysql from 'mysql2';

// Создаем подключение
const db = mysql.createPool({
  host: 'localhost',        // Адрес хоста MySQL
  user: 'root',             // Имя пользователя для подключения
  password: '36yP42yT',     // Пароль пользователя
  database: 'computer_club',// Название базы данных
  waitForConnections: true,
  connectionLimit: 10,      // Максимум одновременных соединений в пуле
  queueLimit: 0             // Без ограничений в очереди
});

export default db;
