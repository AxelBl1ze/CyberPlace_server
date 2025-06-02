// routes/clubs.js
import express from 'express';
import db from '../db.js';
const router = express.Router();

router.use(express.json());
router.use((err, req, res, next) => {
    if (err instanceof SyntaxError) {
        res.status(400).json({ error: "Invalid JSON" });
    } else {
        next();
    }
});

router.get('/', (req, res) => {
    db.query('SELECT * FROM game', (err, results) => {
      if (err) {
        console.error('Ошибка при запросе игр:', err);
        return res.status(500).json({ error: 'Ошибка при получении игр' });
      }
  
      res.json(results);
    });
  });  

  router.post('/create', (req, res) => {
    const { name, genre } = req.body;

    if (!name || !genre) {
        return res.status(400).json({ error: 'Поля name и genre обязательны' });
    }

    db.query(
        'INSERT INTO game (name, genre) VALUES (?, ?)',
        [name, genre],
        (err, result) => {
            if (err) {
                console.error('Ошибка при создании игры:', err);
                return res.status(500).json({ error: 'Ошибка создания игры' });
            }
            res.status(201).json({ id: result.insertId, name, genre } );
        }
    );
});

// Эндпоинт для удаления игры
router.delete('/:id', (req, res) => {
    const { id } = req.params;

    // Сначала удаляем связи из game_place_game
    db.query('DELETE FROM game_place_game WHERE game_id = ?', [id], (err) => {
        if (err) {
            console.error('Ошибка при удалении связей игры:', err);
            return res.status(500).json({ error: 'Ошибка сервера при удалении связей игры' });
        }

        // Затем удаляем саму игру
        db.query('DELETE FROM game WHERE id = ?', [id], (err, result) => {
            if (err) {
                console.error('Ошибка при удалении игры:', err);
                return res.status(500).json({ error: 'Ошибка сервера при удалении игры' });
            }

            if (result.affectedRows === 0) {
                return res.status(404).json({ error: 'Игра не найдена' });
            }

            res.json({ success: true });
        });
    });
});

export default router;