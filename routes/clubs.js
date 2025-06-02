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

// Получение клуба по ID администратора
router.get('/:adminId/club', (req, res) => {
    const adminId = req.params.adminId;
    
    const query = `
        SELECT c.* 
        FROM computer_club c
        JOIN admin a ON c.id = a.club_id
        WHERE a.id = ?
    `;
    
    db.query(query, [adminId], (err, results) => {
        if (err) return res.status(500).json({ error: "Database error" });
        if (results.length === 0) return res.status(404).json({ message: "Club not found" });
        
        res.json(results[0]);
    });
});

// Создание нового клуба
router.post('/', (req, res) => {
    const { name, address, phone_number, description, working_hours, places_count, admin_id } = req.body;
    
    if (!admin_id) {
        return res.status(400).json({ message: "Admin ID is required" });
    }
    
    const clubQuery = `
        INSERT INTO computer_club 
        (name, address, phone_number, description, working_hours, places_count)
        VALUES (?, ?, ?, ?, ?, ?)
    `;
    
    db.query(clubQuery, 
        [name, address, phone_number, description, working_hours, places_count],
        (err, result) => {
            if (err) {
                console.error('Club creation error:', err);
                return res.status(500).json({ message: "Database error" });
            }
            
            const linkQuery = 'UPDATE admin SET club_id = ? WHERE id = ?';
            db.query(linkQuery, [result.insertId, admin_id], (linkErr, linkResult) => {
                if (linkErr) {
                    console.error('Linking error:', linkErr);
                    return res.status(500).json({ message: "Linking failed" });
                }
                
                const newClub = {
                    id: result.insertId,
                    name,
                    address,
                    phone_number,
                    description,
                    working_hours,
                    places_count,
                    admin_id
                };
                
                res.status(201).json(newClub);
            });
        }
    );
});

// Обновление информации о клубе
router.put('/:clubId', (req, res) => {
    const clubId = req.params.clubId;
    const updates = req.body;
    
    const validFields = [
        'name', 'address', 'phone_number', 
        'description', 'working_hours', 'places_count'
    ];
    
    const updateFields = [];
    const values = [];
    
    for (const [key, value] of Object.entries(updates)) {
        if (validFields.includes(key)) {
            updateFields.push(`${key} = ?`);
            values.push(value);
        }
    }
    
    if (updateFields.length === 0) {
        return res.status(400).json({ message: "No valid fields to update" });
    }
    
    values.push(clubId);
    
    const query = `
        UPDATE computer_club
        SET ${updateFields.join(', ')}
        WHERE id = ?
    `;
    
    db.query(query, values, (err, result) => {
        if (err) {
            console.error('Ошибка обновления клуба:', err);
            return res.status(500).json({ message: "Database error" });
        }
        
        if (result.affectedRows === 0) {
            return res.status(404).json({ message: "Club not found" });
        }
        
        res.json({ message: "Club updated successfully" });
    });
});

// Получение игровых мест клуба
router.get('/:clubId/game-places', (req, res) => {
    const clubId = req.params.clubId;
    
    const query = `
        SELECT * 
        FROM game_place 
        WHERE club_id = ?
    `;
    
    db.query(query, [clubId], (err, results) => {
        if (err) return res.status(500).json({ message: "Database error" });
        res.json(results);
    });
});

router.get('/:clubId/tariffs', (req, res) => {
    const clubId = req.params.clubId;
    
    db.query(
        'SELECT * FROM tariff WHERE club_id = ?',
        [clubId],
        (err, results) => {
            if (err) return res.status(500).json({ 
                error: "Database error",
                details: err.message 
            });
            
            // Возвращаем данные в обертке
            res.json({ 
                data: results,
                message: "Success" 
            });
        }
    );
});

router.get('/:clubId/specs', (req, res) => {
    const clubId = req.params.clubId;
    
    db.query(
        'SELECT * FROM hardware_specs WHERE club_id = ?',
        [clubId],
        (err, results) => {
            if (err) {
                console.error('Ошибка загрузки спецификаций:', err);
                return res.status(500).json({ error: "Database error" });
            }
            res.json(results);
        }
    );
});

router.get('/:clubId/games', (req, res) => {
    const clubId = req.params.clubId;
    
    db.query(
        'SELECT * FROM game WHERE club_id = ?',
        [clubId],
        (err, results) => {
            if (err) {
                console.error('Ошибка загрузки игр:', err);
                return res.status(500).json({ error: "Database error" });
            }
            res.json(results);
        }
    );
});

// Создание нового игрового места
router.post('/game-places', (req, res) => {
    const { club_id, description, available } = req.body;

    if (club_id == null || available == null) {
        return res.status(400).json({ message: "Missing required fields: club_id or available" });
    }

    const query = `
        INSERT INTO game_place (club_id, description, available, tariff_id, specs_id)
        VALUES (?, ?, ?, NULL, NULL)
    `;

    db.query(query, [club_id, description || null, available ? 1 : 0], (err, result) => {
        if (err) {
            console.error('Ошибка при добавлении игрового места:', err);
            return res.status(500).json({ message: "Database error" });
        }

        res.status(201).json({
            id: result.insertId,
            club_id,
            description,
            available: !!available,
            tariff_id: null,
            specs_id: null
        });
    });
});

router.delete('/game-place/:id', (req, res) => {
    const gamePlaceId = req.params.id;  

    console.log("Received delete request for game place ID:", gamePlaceId);  

    // SQL запрос на удаление
    const query = `DELETE FROM game_place WHERE id = ?`;

    db.query(query, [gamePlaceId], (err, result) => {
        if (err) {
            console.error('Ошибка при удалении игрового места:', err);
            return res.status(500).json({ message: "Database error" });
        }

        if (result.affectedRows === 0) {
            return res.status(404).json({ message: "Game place not found" });
        }

        res.status(200).json({ message: "Game place deleted successfully" });
    });
});

// 2. Получить игры для конкретного места
router.get('/game-places/:placeId/games', (req, res) => {
    const placeId = req.params.placeId;
  
    const query = `
      SELECT g.* 
      FROM game g
      JOIN game_place_game pg ON g.id = pg.game_id
      WHERE pg.game_place_id = ?
    `;
  
    db.query(query, [placeId], (err, results) => {
      if (err) {
        console.error('Ошибка при загрузке игр места:', err);
        return res.status(500).json({ error: 'Ошибка загрузки игр места' });
      }
  
      res.json(results);
    });
});  

// 3. Получить характеристики для места
router.get('/game-places/:placeId/specs', async (req, res) => {
    try {
        const { placeId } = req.params;
        const place = await db.query('SELECT specs_id FROM game_place WHERE id = $1', [placeId]);
        
        if (!place.rows[0]?.specs_id) {
            return res.json(null);
        }

        const specs = await db.query('SELECT * FROM hardware_specs WHERE id = $1', [place.rows[0].specs_id]);
        res.json(specs.rows[0]);
    } catch (err) {
        res.status(500).json({ error: 'Ошибка загрузки характеристик' });
    }
});

// 4. Создать/обновить характеристики
/*router.post('/hardware-specs', async (req, res) => {
    try {
        const { cpu, gpu, ram, storage, os } = req.body;
        const newSpec = await db.query(`
            INSERT INTO hardware_specs (cpu, gpu, ram, storage, os)
            VALUES ($1, $2, $3, $4, $5)
            RETURNING *
        `, [cpu, gpu, ram, storage, os]);
        
        res.json(newSpec.rows[0]);
    } catch (err) {
        res.status(500).json({ error: 'Ошибка создания характеристик' });
    }
});*/

// 5. Привязать игры к месту
router.post('/game-places/:placeId/games', (req, res) => {
    const { placeId } = req.params;
    const { gameIds } = req.body;
  
    // Удаляем старые связи
    db.query(
      'DELETE FROM game_place_game WHERE game_place_id = ?',
      [placeId],
      (err) => {
        if (err) {
          console.error('Ошибка удаления:', err);
          return res.status(500).json({ error: 'Ошибка удаления старых записей' });
        }
  
        // Добавляем новые связи
        let insertCount = 0;
        for (let i = 0; i < gameIds.length; i++) {
          db.query(
            'INSERT INTO game_place_game (game_place_id, game_id) VALUES (?, ?)',
            [placeId, gameIds[i]],
            (err) => {
              if (err) {
                console.error('Ошибка вставки:', err);
                return res.status(500).json({ error: 'Ошибка вставки данных' });
              }
              insertCount++;
              if (insertCount === gameIds.length) {
                res.json({ success: true });
              }
            }
          );
        }
  
        // Если массив пустой
        if (gameIds.length === 0) {
          res.json({ success: true });
        }
      }
    );
});    

// Получение характеристик по ID
router.get('/hardware-specs/:id', (req, res) => {
    const { id } = req.params;
    db.query('SELECT * FROM hardware_specs WHERE id = ?', [id], (err, results) => {
        if (err) {
            console.error('Ошибка получения характеристик:', err);
            return res.status(500).json({ error: 'Ошибка сервера' });
        }
        
        if (results.length === 0) {
            return res.status(404).json({ error: 'Характеристики не найдены' });
        }
        
        res.json(results[0]);
    });
});

// Создание/обновление характеристик
router.post('/hardware-specs', (req, res) => {
    const { id, cpu, gpu, ram, storage, os, placeId } = req.body;

    if (!cpu || !gpu || !ram || !storage || !os || !placeId) {
        return res.status(400).json({ error: 'Все поля обязательны' });
    }

    if (id) {
        // Обновление существующих характеристик
        db.query(
            'UPDATE hardware_specs SET cpu = ?, gpu = ?, ram = ?, storage = ?, os = ? WHERE id = ?',
            [cpu, gpu, ram, storage, os, id],
            (err, result) => {
                if (err) {
                    console.error('Ошибка обновления характеристик:', err);
                    return res.status(500).json({ error: 'Ошибка сервера' });
                }
                
                // Всегда возвращаем обновленные характеристики
                res.json({ id, cpu, gpu, ram, storage, os });
            }
        );
    } else {
        // Создание новых характеристик
        db.query(
            'INSERT INTO hardware_specs (cpu, gpu, ram, storage, os) VALUES (?, ?, ?, ?, ?)',
            [cpu, gpu, ram, storage, os],
            (err, result) => {
                if (err) {
                    console.error('Ошибка создания характеристик:', err);
                    return res.status(500).json({ error: 'Ошибка сервера' });
                }
                
                const newId = result.insertId;
                
                // Привязываем характеристики к месту
                db.query(
                    'UPDATE game_place SET specs_id = ? WHERE id = ?',
                    [newId, placeId],
                    (err) => {
                        if (err) {
                            console.error('Ошибка привязки характеристик:', err);
                            return res.status(500).json({ error: 'Ошибка сервера' });
                        }
                        res.json({ id: newId, cpu, gpu, ram, storage, os });
                    }
                );
            }
        );
    }
});

router.get('/hardware-specs/:id', (req, res) => {
    const specsId = req.params.id;

    const query = 'SELECT id, cpu, gpu, ram, storage, os FROM hardware_specs WHERE id = ?';

    db.query(query, [specsId], (err, results) => {
        if (err) {
            console.error('Ошибка при загрузке характеристик:', err);
            return res.status(500).json({ error: 'Ошибка сервера' });
        }

        if (results.length === 0) {
            return res.status(404).json({ error: 'Характеристики не найдены' });
        }

        res.json(results[0]);
    });
});

// Получение информации о месте по ID
router.get('/game-places/:id', (req, res) => {
    const placeId = req.params.id;
    
    db.query('SELECT * FROM game_place WHERE id = ?', [placeId], (err, results) => {
        if (err) {
            console.error('Ошибка получения места:', err);
            return res.status(500).json({ error: 'Ошибка сервера' });
        }
        
        if (results.length === 0) {
            return res.status(404).json({ error: 'Место не найдено' });
        }
        
        const place = results[0];
        res.json({
            id: place.id,
            description: place.description,
            available: place.available
        });
    });
});

// Обновление информации о месте
router.put('/game-places/:id', (req, res) => {
    const placeId = req.params.id;
    const { description, available } = req.body;
    
    if (description === undefined || available === undefined) {
        return res.status(400).json({ error: 'Необходимо указать описание и статус доступности' });
    }

    db.query(
        'UPDATE game_place SET description = ?, available = ? WHERE id = ?',
        [description, available, placeId],
        (err, result) => {
            if (err) {
                console.error('Ошибка обновления места:', err);
                return res.status(500).json({ error: 'Ошибка сервера' });
            }
            
            res.json({ success: true });
        }
    );
});

// Получение списка всех клубов с информацией о доступных местах
router.get('/', (req, res) => {
    const query = `
        SELECT 
            cc.id, 
            cc.name, 
            cc.address AS location,
            cc.working_hours,
            cc.places_count AS total_places,
            (
                SELECT COUNT(*) 
                FROM game_place gp
                WHERE gp.club_id = cc.id
                AND gp.available = 1
                AND NOT EXISTS (
                    SELECT 1 
                    FROM booking b 
                    WHERE b.game_place_id = gp.id 
                        AND b.status = 'active'
                        AND (
                            b.start_time >= NOW()  -- будущее бронирование
                            OR (
                                b.start_time <= NOW() 
                                AND DATE_ADD(b.start_time, INTERVAL b.duration_minutes MINUTE) >= NOW()
                            )
                        )
                )
            ) AS available_places
        FROM computer_club cc
    `;
    
    db.query(query, (err, results) => {
        if (err) {
            console.error('Ошибка получения клубов:', err);
            return res.status(500).json({ error: 'Ошибка сервера' });
        }
        
        const clubs = results.map(club => ({
            id: club.id,
            name: club.name,
            location: club.location,
            working_hours: club.working_hours,
            total_places: club.total_places,
            available_places: club.available_places
        }));
        
        res.json(clubs);
    });
});

// 1. Получение мест в клубе с текущим статусом
router.get('/clubs/:clubId/game-places', (req, res) => {
    const clubId = req.params.clubId;
    
    const query = `
        SELECT 
            gp.id,
            gp.description,
            gp.available,
            t.cost AS price_per_hour,
            t.name AS tariff_name,
            hs.cpu, hs.gpu, hs.ram, hs.storage, hs.os,
            (SELECT COUNT(*) FROM booking b 
             WHERE b.game_place_id = gp.id 
             AND b.status IN ('active')) AS is_booked,
            (
                SELECT GROUP_CONCAT(g.name SEPARATOR ', ') 
                FROM game_place_game gpg
                JOIN game g ON gpg.game_id = g.id
                WHERE gpg.game_place_id = gp.id
            ) AS games
        FROM game_place gp
        JOIN tariff t ON gp.tariff_id = t.id
        JOIN hardware_specs hs ON gp.specs_id = hs.id
        WHERE gp.club_id = ?
    `;
    
    db.query(query, [clubId], (err, results) => {
        if (err) {
            console.error('Ошибка получения мест:', err);
            return res.status(500).json({ error: 'Ошибка сервера' });
        }
        
        res.json(results);
    });
});

export default router;