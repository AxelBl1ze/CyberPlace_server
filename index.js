import express from "express";
import cors from "cors";
import db from './db.js';
import userRouter from "./routes/user.js";
import adminRouter from "./routes/admin.js";
import clubRouter from "./routes/clubs.js";
import gamesRouter from "./routes/games.js";
import tariffsRouter from "./routes/tariffs.js";
import bookingsRouter from "./routes/bookings.js";
import paymentRouter from "./routes/payment.js";

const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json());

app.use("/api/user", userRouter);
app.use("/api/admin", adminRouter);
app.use("/api/clubs", clubRouter);
app.use("/api/games", gamesRouter);
app.use("/api/tariffs", tariffsRouter);
app.use("/api/bookings", bookingsRouter);
app.use("/api/payment", paymentRouter);

app.post('/check-login', (req, res) => {
  const { login } = req.body;
  
  const checkUser = () => {
      return new Promise((resolve, reject) => {
          db.query(
              'SELECT id FROM user WHERE login = ? UNION SELECT id FROM admin WHERE login = ? LIMIT 1',
              [login, login],
              (err, results) => {
                  if (err) return reject(err);
                  resolve(results.length > 0 ? results[0] : null);
              }
          );
      });
  };

  checkUser()
      .then(user => {
          if (!user) return res.status(404).json({ error: "Пользователь не найден" });
          
          db.query(
              'SELECT EXISTS(SELECT 1 FROM admin WHERE id = ?) AS is_admin',
              [user.id],
              (err, results) => {
                  if (err) return res.status(500).json({ error: "Ошибка сервера" });
                  const type = results[0].is_admin ? 'admin' : 'user';
                  res.json({ type });
              }
          );
      })
      .catch(err => {
          console.error(err);
          res.status(500).json({ error: "Ошибка сервера" });
      });
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
