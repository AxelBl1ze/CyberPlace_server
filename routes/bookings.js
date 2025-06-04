import db from '../db.js';
import express from 'express';
import cron from 'node-cron';
const router = express.Router();

// 2. Временная блокировка места
router.post('/reserve', (req, res) => {
    const { placeId, userId, startTime, duration } = req.body;
    
    // Получаем соединение из пула
    db.getConnection((err, connection) => {
        if (err) {
            console.error('Ошибка подключения:', err);
            return res.status(500).json({ error: 'Ошибка сервера' });
        }
        
        // Начинаем транзакцию
        connection.beginTransaction(transactionErr => {
            if (transactionErr) {
                connection.release();
                console.error('Ошибка транзакции:', transactionErr);
                return res.status(500).json({ error: 'Ошибка сервера' });
            }
            
            // 1. Проверка доступности места с блокировкой
            const checkQuery = `
                SELECT COUNT(*) AS count 
                FROM booking 
                WHERE 
                    game_place_id = ? 
                    AND status = 'active'
                    AND NOT (
                        ADDTIME(start_time, SEC_TO_TIME(duration_minutes * 60)) <= ?
                        OR start_time >= ADDTIME(?, SEC_TO_TIME(? * 60))
                    )
                FOR UPDATE`;
            
            connection.query(checkQuery, [placeId, startTime, startTime, duration], (checkErr, checkResults) => {
                if (checkErr) {
                    return connection.rollback(() => {
                        connection.release();
                        console.error('Ошибка проверки:', checkErr);
                        res.status(500).json({ error: 'Ошибка сервера' });
                    });
                }
                
                const isAvailable = checkResults[0]?.count === 0;
                
                if (!isAvailable) {
                    return connection.rollback(() => {
                        connection.release();
                        res.status(400).json({ error: 'Место уже забронировано' });
                    });
                }
                
                // 2. Находим клуб по месту
                connection.query('SELECT club_id FROM game_place WHERE id = ?', [placeId], (clubErr, clubResults) => {
                    if (clubErr || clubResults.length === 0) {
                        return connection.rollback(() => {
                            connection.release();
                            console.error('Ошибка при поиске клуба:', clubErr);
                            res.status(clubErr ? 500 : 404).json({ 
                                error: clubErr ? 'Ошибка сервера' : 'Место не найдено' 
                            });
                        });
                    }
                    
                    const clubId = clubResults[0].club_id;
                    
                    // 3. Находим админа клуба
                    connection.query('SELECT id FROM admin WHERE club_id = ? LIMIT 1', [clubId], (adminErr, adminResults) => {
                        if (adminErr) {
                            return connection.rollback(() => {
                                connection.release();
                                console.error('Ошибка при поиске админа:', adminErr);
                                res.status(500).json({ error: 'Ошибка сервера' });
                            });
                        }
                        
                        const adminId = adminResults.length > 0 ? adminResults[0].id : null;
                        
                        // 4. Создаем бронь
                        const insertQuery = `
                            INSERT INTO booking 
                            (user_id, admin_id, game_place_id, start_time, duration_minutes, status) 
                            VALUES (?, ?, ?, ?, ?, 'active')`;
                        
                        connection.query(insertQuery, [userId, adminId, placeId, startTime, duration], (insertErr, result) => {
                            if (insertErr) {
                                return connection.rollback(() => {
                                    connection.release();
                                    console.error('Ошибка бронирования:', insertErr);
                                    res.status(500).json({ error: 'Ошибка бронирования' });
                                });
                            }
                            
                            // Фиксируем транзакцию
                            connection.commit(commitErr => {
                                if (commitErr) {
                                    return connection.rollback(() => {
                                        connection.release();
                                        console.error('Ошибка коммита:', commitErr);
                                        res.status(500).json({ error: 'Ошибка сервера' });
                                    });
                                }
                                
                                connection.release();
                                const bookingId = result.insertId;
                                
                                // Таймер для отмены брони через 5 минут
                                setTimeout(() => {
                                    db.query('DELETE FROM booking WHERE id = ? AND status = "active"', [bookingId]);
                                }, 5 * 60 * 1000);
                                
                                res.json({ bookingId });
                            });
                        });
                    });
                });
            });
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
    const debugQuery = `
        SELECT id, start_time, duration_minutes, 
               DATE_ADD(start_time, INTERVAL duration_minutes MINUTE) AS end_time,
               NOW()
        FROM booking
        WHERE status = 'active'
    `;

    db.query(debugQuery, (err, rows) => {
        if (err) {
            console.error('[DEBUG] Ошибка запроса активных броней:', err);
            return;
        }

        console.log('[DEBUG] Активные брони:');
        rows.forEach(r => {
            console.log(`ID: ${r.id}, end: ${r.end_time}, now: ${r['NOW()']}`);
        });

        const idsToComplete = rows
            .filter(r => new Date(r.end_time) < new Date())
            .map(r => r.id);

        if (idsToComplete.length > 0) {
            console.log(`[CRON] Завершаются брони: ${idsToComplete.join(', ')}`);

            const updateQuery = `
                UPDATE booking 
                SET status = 'completed'
                WHERE id IN (?)
            `;

            db.query(updateQuery, [idsToComplete], (err, result) => {
                if (err) {
                    console.error('[CRON] Ошибка завершения броней:', err);
                } else {
                    console.log(`[CRON] Завершено броней: ${result.affectedRows}`);
                }
            });
        } else {
            console.log('[CRON] Нет броней для завершения');
        }
    });
});

export default router;
