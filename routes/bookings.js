import db from '../db.js';
import express from 'express';
import cron from 'node-cron';
const router = express.Router();

// 2. Временная блокировка места
router.post('/reserve', (req, res) => {
    const { placeId, userId, startTime, duration } = req.body;
    
    // 1. Находим клуб по месту
    db.query('SELECT club_id FROM game_place WHERE id = ?', [placeId], (err, clubResults) => {
        if (err) {
            console.error('Ошибка при поиске клуба:', err);
            return res.status(500).json({ error: 'Ошибка сервера' });
        }
        
        if (clubResults.length === 0) {
            return res.status(404).json({ error: 'Место не найдено' });
        }
        
        const clubId = clubResults[0].club_id;
        
        // 2. Находим админа клуба
        db.query('SELECT id FROM admin WHERE club_id = ? LIMIT 1', [clubId], (err, adminResults) => {
            if (err) {
                console.error('Ошибка при поиске админа:', err);
                return res.status(500).json({ error: 'Ошибка сервера' });
            }
            
            const adminId = adminResults.length > 0 ? adminResults[0].id : null;
            
            // 3. Проверяем доступность места
            db.query(
                'SELECT * FROM booking WHERE game_place_id = ? AND status IN ("active")',
                [placeId],
                (err, results) => {
                    if (err) return res.status(500).json({ error: 'Ошибка сервера' });
                    if (results.length > 0) {
                        return res.status(400).json({ error: 'Место уже забронировано' });
                    }
                    
                    // 4. Создаем бронь с adminId
                    db.query(
                        `INSERT INTO booking 
                        (user_id, admin_id, game_place_id, start_time, duration_minutes, status) 
                        VALUES (?, ?, ?, ?, ?, 'active')`,
                        [userId, adminId, placeId, startTime, duration],
                        (err, result) => {
                            if (err) {
                                console.error('Ошибка бронирования:', err);
                                return res.status(500).json({ error: 'Ошибка бронирования' });
                            }
                            
                            const bookingId = result.insertId;
                            // Устанавливаем таймер на 5 минут для отмены
                            setTimeout(() => {
                                db.query('DELETE FROM booking WHERE id = ? AND status = "active"', [bookingId]);
                            }, 5 * 60 * 1000);
                            
                            res.json({ bookingId });
                        }
                    );
                }
            );
        });
    });
});

// Эндпоинт для получения бронирований пользователя
router.get('/', (req, res) => {
    const userId = req.query.userId;
    const type = req.query.type || 'active';
    
    let statusCondition = '';
    switch(type) {
        case 'active':
            statusCondition = "b.status = 'active'";
            break;
        case 'history':
            statusCondition = "b.status IN ('completed', 'cancelled')";
            break;
        default:
            statusCondition = "1=1";
    }
    
    const query = `
        SELECT 
            b.id,
            b.start_time AS startTime,
            b.duration_minutes AS duration,
            b.status,
            gp.description AS gamePlaceName,
            cc.name AS clubName,
            t.name AS tariffName,
            t.cost AS pricePerHour,
            (
                SELECT GROUP_CONCAT(g.name SEPARATOR ', ') 
                FROM game_place_game gpg
                JOIN game g ON gpg.game_id = g.id
                WHERE gpg.game_place_id = gp.id
            ) AS games
        FROM booking b
        JOIN game_place gp ON b.game_place_id = gp.id
        JOIN computer_club cc ON gp.club_id = cc.id
        JOIN tariff t ON gp.tariff_id = t.id
        WHERE b.user_id = ? AND ${statusCondition}
        ORDER BY b.start_time DESC
    `;
    
    db.query(query, [userId], (err, results) => {
        if (err) {
            console.error('Ошибка получения бронирований:', err);
            return res.status(500).json({ error: 'Ошибка сервера' });
        }
        
        res.json(results);
    });
});

// Эндпоинт для отмены бронирования
router.post('/:bookingId/cancel', (req, res) => {
    const bookingId = req.params.bookingId;
    const userId = req.query.userId;

    // Проверяем, что бронь принадлежит пользователю и активна
    db.query(
        'SELECT * FROM booking WHERE id = ? AND user_id = ?',
        [bookingId, userId],
        (err, bookingResults) => {
            if (err) return res.status(500).json({ error: 'Ошибка сервера' });
            if (bookingResults.length === 0) return res.status(404).json({ error: 'Бронирование не найдено' });

            // Ищем платёж по брони
            db.query(
                'SELECT * FROM payment WHERE booking_id = ? AND user_id = ? AND status = "paid"',
                [bookingId, userId],
                (err, paymentResults) => {
                    if (err) return res.status(500).json({ error: 'Ошибка сервера при поиске платежа' });
                    if (paymentResults.length === 0) return res.status(404).json({ error: 'Платеж не найден' });

                    const payment = paymentResults[0];
                    const amount = payment.amount;

                    if (amount === undefined || amount === null) {
                        console.error('Некорректное значение amount:', amount);
                        return res.status(500).json({ error: 'Некорректная сумма платежа' });
                    }

                    const amountNum = parseFloat(amount);
                    if (isNaN(amountNum)) {
                        console.error('Некорректное числовое значение суммы:', amount);
                        return res.status(500).json({ error: 'Некорректная сумма платежа' });
                    }

                    const refundAmount = amountNum * 0.9;

                    // Обновляем статус брони
                    db.query(
                        `UPDATE booking SET status = 'cancelled' WHERE id = ?`,
                        [bookingId],
                        (err) => {
                            if (err) return res.status(500).json({ error: 'Ошибка отмены брони' });

                            // Обновляем статус платежа (например, на refunded)
                            db.query(
                                `UPDATE payment SET status = 'refunded' WHERE id = ?`,
                                [payment.id],
                                (err) => {
                                    if (err) {
                                        console.error('Ошибка обновления статуса платежа:', err);
                                        // Можно не прерывать, а просто логировать
                                    }

                                    // Возвращаем средства на баланс пользователя
                                    db.query(
                                        `UPDATE user SET balance = balance + ? WHERE id = ?`,
                                        [refundAmount, userId],
                                        (err) => {
                                            if (err) {
                                                console.error('Ошибка возврата средств:', err);
                                                return res.status(500).json({ error: 'Ошибка возврата средств' });
                                            }

                                            res.json({ success: true, refundAmount });
                                        }
                                    );
                                }
                            );
                        }
                    );
                }
            );
        }
    );
});



cron.schedule('* * * * *', () => {
    const selectQuery = `
        SELECT id FROM booking 
        WHERE status = 'active' AND DATE_ADD(start_time, INTERVAL duration_minutes MINUTE) < NOW()
    `;

    db.query(selectQuery, (err, rows) => {
        if (err) {
            console.error('Ошибка выборки бронирований для завершения:', err);
            return;
        }

        if (rows.length > 0) {
            console.log(`Брони для завершения: ${rows.map(r => r.id).join(', ')}`);

            const ids = rows.map(r => r.id);

            const updateQuery = `
                UPDATE booking 
                SET status = 'completed'
                WHERE id IN (?)
            `;

            db.query(updateQuery, [ids], (err, result) => {
                if (err) {
                    console.error('Ошибка завершения бронирований:', err);
                } else {
                    console.log(`Завершено бронирований: ${result.affectedRows}`);
                }
            });
        } else {
            console.log('Нет броней для завершения');
        }
    });
});


export default router;
