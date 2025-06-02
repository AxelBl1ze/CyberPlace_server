import db from '../db.js';
import express from 'express';
const router = express.Router();

// Создание тарифа и привязка к месту
router.post('/:placeId/tariffs', (req, res) => {
    const { placeId } = req.params;
    const { name, cost } = req.body;

    // 1. Создаем тариф
    db.query(
        'INSERT INTO tariff (name, cost) VALUES (?, ?)',
        [name, cost],
        (err, tariffResult) => {
            if (err) {
                console.error('Ошибка создания тарифа:', err);
                return res.status(500).json({ error: 'Ошибка создания тарифа' });
            }

            const tariffId = tariffResult.insertId;

            // 2. Привязываем тариф к месту
            db.query(
                'UPDATE game_place SET tariff_id = ? WHERE id = ?',
                [tariffId, placeId],
                (err, updateResult) => {
                    if (err) {
                        console.error('Ошибка привязки тарифа:', err);
                        return res.status(500).json({ error: 'Ошибка привязки тарифа' });
                    }

                    if (updateResult.affectedRows === 0) {
                        return res.status(404).json({ error: 'Игровое место не найдено' });
                    }

                    // 3. Возвращаем созданный тариф
                    res.json({ 
                        success: true,
                        tariff: { id: tariffId, name, cost }
                    });
                }
            );
        }
    );
});

// Обновление тарифа
router.put('/:tariffId', (req, res) => {
    const { tariffId } = req.params;
    const { name, cost } = req.body;
  
    const sql = `
      UPDATE tariff
      SET name = ?, cost = ?
      WHERE id = ?
    `;
  
    db.query(sql, [name, cost, tariffId], (err, results) => {
      if (err) {
        console.error(err);
        return res.status(500).json({ error: 'Ошибка обновления тарифа' });
      }
      res.json({ success: true });
    });
  });
  

router.get('/:id', (req, res) => {
    const tariffId = req.params.id;

    const query = 'SELECT * FROM tariff WHERE id = ?';
    db.query(query, [tariffId], (err, results) => {
        if (err) {
            console.error('Ошибка при получении тарифа:', err);
            return res.status(500).json({ error: 'Ошибка сервера' });
        }

        if (results.length === 0) {
            return res.status(404).json({ error: 'Тариф не найден' });
        }

        const tariff = results[0];
        res.json({
            id: tariff.id,
            name: tariff.name,
            cost: tariff.cost
        });
    });
});

export default router;
