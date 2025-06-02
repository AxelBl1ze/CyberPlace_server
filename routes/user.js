import bcrypt from 'bcrypt';
import db from '../db.js';
import express from 'express';
const router = express.Router();

router.post("/register", async (req, res) => {
  const { full_name, phone, login, password } = req.body;

  if (!full_name || !login || !password) {
    return res.status(400).json({ message: "Missing fields" });
  }

  try {
    const password_hash = await bcrypt.hash(password, 10);

    const query = `
      INSERT INTO user (full_name, phone_number, login, password_hash, balance)
      VALUES (?, ?, ?, ?, ?)
    `;

    db.query(query, [full_name, phone || null, login, password_hash, 0], (err, result) => {
      if (err) {
        console.error('Ошибка при регистрации:', err);
        if (err.code === 'ER_DUP_ENTRY') {
          return res.status(409).json({ message: "Login already exists" });
        }
        return res.status(500).json({ message: "Internal server error" });
      }

      res.status(201).json({ message: "User registered successfully" });
    });
  } catch (err) {
    console.error('Ошибка при хешировании пароля:', err);
    res.status(500).json({ message: "Internal server error" });
  }
});

router.post("/login", (req, res) => {
  const { login, password } = req.body;

  if (!login || !password) {
    return res.status(400).json({ message: "Missing fields" });
  }

  const query = "SELECT * FROM user WHERE login = ?";
  db.query(query, [login], async (err, results) => {
    if (err) return res.status(500).json({ message: "DB error" });
    if (results.length === 0) return res.status(401).json({ message: "User not found" });

    const user = results[0];
    const isMatch = await bcrypt.compare(password, user.password_hash);

    if (!isMatch) return res.status(401).json({ message: "Incorrect password" });

    // Не отправляй пароль пользователю
    delete user.password_hash;
    res.json({ user });
  });
});

router.get("/profile", (req, res) => {
  const userId = req.query.userId;
  
  if (!userId) return res.status(400).json({ message: "User ID required" });

  const query = "SELECT full_name, phone_number, login, balance, club_card_number FROM user WHERE id = ?";
  db.query(query, [userId], (err, results) => {
    if (err) return res.status(500).json({ message: "DB error" });
    if (results.length === 0) return res.status(404).json({ message: "User not found" });

    const user = results[0];

    res.json({
      full_name: user.full_name,
      phone_number: user.phone_number,
      login: user.login,
      balance: parseFloat(user.balance),
      club_card_number: user.club_card_number
    });
  });
});

router.post('/create-card', (req, res) => {
  const userId = req.body.user_id;
  
  const generateCardNumber = () => {
      const randomPart = Math.floor(1000000000000000 + Math.random() * 9000000000000000).toString().substring(0, 16);
      return randomPart.replace(/(\d{4})(?=\d)/g, "$1 ");
  };

  const checkCardUnique = (number) => {
      return new Promise((resolve, reject) => {
          db.query('SELECT id FROM user WHERE club_card_number = ?', [number], (err, results) => {
              if (err) return reject(err);
              resolve(results.length === 0);
          });
      });
  };

  const assignCard = async () => {
      let isUnique = false;
      let cardNumber;
      
      while (!isUnique) {
          cardNumber = generateCardNumber();
          isUnique = await checkCardUnique(cardNumber);
      }
      
      db.query('UPDATE user SET club_card_number = ? WHERE id = ?', 
          [cardNumber, userId], 
          (err, results) => {
              if (err) return res.status(500).json({ error: 'Database error' });
              res.json({ card_number: cardNumber });
          }
      );
  };

  assignCard().catch(err => {
      console.error(err);
      res.status(500).json({ error: 'Server error' });
  });
});

router.post('/reset-password', async (req, res) => {
  const { login, new_password } = req.body;
  
  try {
      const passwordHash = await bcrypt.hash(new_password, 10);
      
      db.query(
          'UPDATE user SET password_hash = ? WHERE login = ?',
          [passwordHash, login],
          (err, result) => {
              if (err) return res.status(500).json({ error: "Ошибка базы данных" });
              if (result.affectedRows === 0) return res.status(404).json({ error: "Пользователь не найден" });
              res.sendStatus(200);
          }
      );
  } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Ошибка сервера" });
  }
});

export default router;
