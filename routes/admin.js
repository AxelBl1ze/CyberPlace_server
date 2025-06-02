import bcrypt from 'bcrypt';
import db from '../db.js';
import express from 'express';
const router = express.Router();

router.use(express.json());
router.use((err, req, res, next) => {
    if (err instanceof SyntaxError) {
        res.status(400).json({ error: "Invalid JSON" });
    } else {
        next();
    }
});

router.post("/register", async (req, res) => {
  const { full_name, phone, login, password } = req.body;

  if (!full_name || !login || !password) {
    return res.status(400).json({ message: "Missing fields" });
  }

  try {
    const password_hash = await bcrypt.hash(password, 10);

    const query = `
      INSERT INTO admin (full_name, phone_number, login, password_hash)
      VALUES (?, ?, ?, ?)
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

  const query = "SELECT * FROM admin WHERE login = ?";
  db.query(query, [login], async (err, results) => {
    if (err) return res.status(500).json({ message: "DB error" });
    if (results.length === 0) return res.status(401).json({ message: "Admin not found" });

    const admin = results[0];
    const isMatch = await bcrypt.compare(password, admin.password_hash);

    if (!isMatch) return res.status(401).json({ message: "Incorrect password" });

    delete admin.password_hash;
    res.json({ admin });
  });
});

router.post('/reset-password', async (req, res) => {
  const { login, new_password } = req.body;
  
  try {
      const passwordHash = await bcrypt.hash(new_password, 10);
      
      db.query(
          'UPDATE admin SET password_hash = ? WHERE login = ?',
          [passwordHash, login],
          (err, result) => {
              if (err) return res.status(500).json({ error: "Ошибка базы данных" });
              if (result.affectedRows === 0) return res.status(404).json({ error: "Администратор не найден" });
              res.sendStatus(200);
          }
      );
  } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Ошибка сервера" });
  }
});

router.get("/profile", (req, res) => {
  const adminId = req.query.adminId;
  
  if (!adminId) return res.status(400).json({ message: "Admin ID required" });

  const query = `
      SELECT 
          id,
          full_name,
          phone_number,
          login,
          club_id
      FROM admin 
      WHERE id = ?`;
      
  db.query(query, [adminId], (err, results) => {
      if (err) return res.status(500).json({ message: "DB error" });
      if (results.length === 0) return res.status(404).json({ message: "Admin not found" });

      const adminData = results[0];
      res.json({
          id: adminData.id,
          full_name: adminData.full_name,
          phone_number: adminData.phone_number,
          login: adminData.login,
          club_id: adminData.club_id
      });
  });
});

router.get('/:adminId/club', async (req, res) => {
  try {
      const [results] = await db.query(
          `SELECT c.* FROM computer_club c 
           JOIN admin a ON c.id = a.club_id 
           WHERE a.id = ?`,
          [req.params.adminId]
      );
      
      if (results.length === 0) {
          return res.status(404).json({ error: "Club not found" });
      }
      
      res.json(results[0]);
  } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Database error" });
  }
});

// Привязка клуба к администратору
// Измените роут:
router.post('/:adminId/link-club', (req, res) => {
  const adminId = req.params.adminId; // Берем ID из URL
  const { club_id } = req.body; // Берем club_id из тела запроса

  if (!club_id) {
      return res.status(400).json({ message: "Club ID required" });
  }

  const query = `UPDATE admin SET club_id = ? WHERE id = ?`;
  
  db.query(query, [club_id, adminId], (err, result) => {
      if (err) {
          console.error('Ошибка привязки клуба:', err);
          return res.status(500).json({ message: "Database error" });
      }
      
      res.json({ message: "Club linked successfully" });
  });
});

export default router;
