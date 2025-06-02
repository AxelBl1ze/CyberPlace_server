import db from '../db.js';
import express from 'express';
const router = express.Router();

// Эндпоинт для обработки оплаты
router.post('/process-payment', (req, res) => {
    const { userId, amount, bookingIds } = req.body;

    // 1. Проверяем баланс пользователя
    db.query('SELECT balance FROM user WHERE id = ?', [userId], (err, results) => {
        if (err) return res.status(500).json({ error: 'Ошибка сервера' });
        if (results.length === 0) return res.status(404).json({ error: 'Пользователь не найден' });
        
        const balance = results[0].balance;
        
        // 2. Проверяем достаточно ли средств
        if (balance < amount) {
            return res.status(400).json({ 
                error: 'Недостаточно средств', 
                required: amount,
                current: balance
            });
        }
        
        // 3. Списание средств
        db.query('UPDATE user SET balance = balance - ? WHERE id = ?', [amount, userId], (err) => {
            if (err) return res.status(500).json({ error: 'Ошибка списания средств' });

            // 4. Подтверждаем бронирования
            const confirmQuery = 'UPDATE booking SET status = "active" WHERE id IN (?)';
            db.query(confirmQuery, [bookingIds], (err) => {
                if (err) return res.status(500).json({ error: 'Ошибка подтверждения брони' });

                // 5. Получаем admin_id для каждого бронирования
                const adminQuery = `
                    SELECT 
                        b.id AS booking_id,
                        a.id AS admin_id
                    FROM booking b
                    JOIN game_place gp ON b.game_place_id = gp.id
                    JOIN computer_club c ON gp.club_id = c.id
                    JOIN admin a ON c.id = a.club_id
                    WHERE b.id IN (?)
                `;

                db.query(adminQuery, [bookingIds], (err, rows) => {
                    if (err) {
                        console.error('Ошибка получения админов:', err);
                        return res.status(500).json({ error: 'Ошибка получения админов' });
                    }
                    
                    if (rows.length !== bookingIds.length) {
                        return res.status(400).json({ error: 'Не удалось найти админов для всех бронирований' });
                    }

                    // 6. Формируем значения для вставки
                    const amountPerBooking = amount / bookingIds.length;
                    const paymentValues = rows.map(row => [
                        row.booking_id,
                        userId,
                        row.admin_id,
                        amountPerBooking,
                        'online',
                        'paid',
                        new Date()
                    ]);

                    // 7. Вставка записей оплаты
                    db.query(`
                        INSERT INTO payment 
                        (booking_id, user_id, admin_id, amount, payment_method, status, payment_time)
                        VALUES ?
                    `, [paymentValues], (err) => {
                        if (err) return res.status(500).json({ error: 'Ошибка создания платежа' });
                        res.json({ success: true });
                    });
                });
            });
        });
    });
});

// Эндпоинт для пополнения баланса
router.post('/top-up', (req, res) => {
    const { userId, amount } = req.body;
    
    if (!userId || !amount) {
        return res.status(400).json({ error: 'Неверные параметры запроса' });
    }
    
    // Проверяем существование пользователя
    db.query('SELECT * FROM user WHERE id = ?', [userId], (err, results) => {
        if (err) return res.status(500).json({ error: 'Ошибка сервера' });
        if (results.length === 0) return res.status(404).json({ error: 'Пользователь не найден' });
        
        // Обновляем баланс
        db.query(
            'UPDATE user SET balance = balance + ? WHERE id = ?',
            [amount, userId],
            (err) => {
                if (err) return res.status(500).json({ error: 'Ошибка обновления баланса' });
                
                // Возвращаем новый баланс
                db.query('SELECT balance FROM user WHERE id = ?', [userId], (err, balanceResults) => {
                    if (err) return res.status(500).json({ error: 'Ошибка получения баланса' });
                    
                    res.json({ 
                        success: true, 
                        newBalance: balanceResults[0].balance 
                    });
                });
            }
        );
    });
});


export default router;
