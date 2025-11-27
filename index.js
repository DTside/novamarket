require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
// Подключаем Stripe
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

const app = express();

const PORT = process.env.PORT || 5000;
const SECRET_KEY = process.env.SECRET_KEY || "super_secret_nova_key";

// Настройка БД (поддержка SSL для Supabase)
const pool = new Pool({
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  database: process.env.DB_NAME,
  ssl: { rejectUnauthorized: false },
});

// Middleware
app.use(cors());
app.use(express.json());

const products = [
    { 
        id: 1, 
        title: 'Iphone 15', 
        price: 999, 
        description: 'Best phone',
        image: 'https://images.unsplash.com/photo-1696446701796-da61225697cc?auto=format&fit=crop&q=80&w=800' 
    },
    { 
        id: 2, 
        title: 'Samsung S24', 
        price: 899, 
        description: 'Android king',
        image: 'https://images.unsplash.com/photo-1706698614275-9c24a646c2f3?auto=format&fit=crop&q=80&w=800' 
    },
    { 
        id: 3, 
        title: 'MacBook Air', 
        price: 1200, 
        description: 'Laptop',
        image: 'https://images.unsplash.com/photo-1517336714731-489689fd1ca4?auto=format&fit=crop&q=80&w=800' 
    }
];

app.get('/', (req, res) => {
    res.send('Backend is running! Go to /api/products');
});

app.get('/api/products', (req, res) => {
    res.json(products);
});
// Роут для получения ОДНОГО товара по ID
app.get('/api/products/:id', (req, res) => {
    const id = parseInt(req.params.id); // Получаем ID из ссылки
    const product = products.find(p => p.id === id); // Ищем в массиве

    if (product) {
        res.json(product); // Если нашли — отдаем
    } else {
        res.status(404).json({ message: 'Товар не найден' }); // Если нет — ошибка
    }
});

// --- РОУТЫ ---

// 1. РЕГИСТРАЦИЯ
app.post('/register', async (req, res) => {
    try {
        const { email, password, full_name } = req.body;
        const userCheck = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
        if (userCheck.rows.length > 0) return res.status(400).json({ message: "Email занят" });

        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        const newUser = await pool.query(
            'INSERT INTO users (email, password_hash, full_name) VALUES ($1, $2, $3) RETURNING id, email, full_name, role, avatar_url',
            [email, hashedPassword, full_name]
        );
        const token = jwt.sign({ id: newUser.rows[0].id }, SECRET_KEY, { expiresIn: '24h' });
        res.json({ token, user: newUser.rows[0] });
    } catch (err) {
        console.error(err.message);
        res.status(500).send("Ошибка сервера");
    }
});

// 2. ВХОД (LOGIN)
app.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        const user = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
        if (user.rows.length === 0) return res.status(401).json({ message: "Неверный email или пароль" });

        const validPassword = await bcrypt.compare(password, user.rows[0].password_hash);
        if (!validPassword) return res.status(401).json({ message: "Неверный email или пароль" });

        const token = jwt.sign({ id: user.rows[0].id }, SECRET_KEY, { expiresIn: '24h' });
        
        // Возвращаем полные данные включая роль и аватар
        res.json({ 
            token, 
            user: { 
                id: user.rows[0].id, 
                email: user.rows[0].email, 
                full_name: user.rows[0].full_name,
                role: user.rows[0].role,
                avatar_url: user.rows[0].avatar_url
            } 
        });
    } catch (err) {
        console.error(err.message);
        res.status(500).send("Ошибка сервера");
    }
});

// 3. ТОВАРЫ (С фильтрами и no-cache)
app.get('/products', async (req, res) => {
    try {
        const { search, category, sort } = req.query;
        let query = 'SELECT * FROM products WHERE 1=1';
        const params = [];

        if (search) {
            params.push(`%${search}%`);
            query += ` AND title ILIKE $${params.length}`;
        }
        if (category && category !== 'all') {
            params.push(category);
            query += ` AND category = $${params.length}`;
        }
        if (sort === 'asc') query += ' ORDER BY price ASC';
        else if (sort === 'desc') query += ' ORDER BY price DESC';
        else query += ' ORDER BY id ASC';

        const result = await pool.query(query, params);
        
        // Отключаем кеш, чтобы картинки обновлялись сразу
        res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
        res.json(result.rows);
    } catch (err) {
        console.error(err.message);
        res.status(500).send("Ошибка сервера");
    }
});

// 4. ОДИН ТОВАР
app.get('/products/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const product = await pool.query('SELECT * FROM products WHERE id = $1', [id]);
        if (product.rows.length === 0) return res.status(404).json({ message: "Товар не найден" });
        res.json(product.rows[0]);
    } catch (err) {
        console.error(err.message);
        res.status(500).send("Ошибка сервера");
    }
});

// 5. СОЗДАНИЕ ЗАКАЗА (+ TELEGRAM BOT)
app.post('/orders', async (req, res) => {
    try {
        const { user_id, items, total_price } = req.body;

        // А. Сохраняем заказ в БД
        const newOrder = await pool.query(
            'INSERT INTO orders (user_id, total_price) VALUES ($1, $2) RETURNING id',
            [user_id, total_price]
        );
        const orderId = newOrder.rows[0].id;

        // Б. Сохраняем товары
        for (const item of items) {
            await pool.query(
                'INSERT INTO order_items (order_id, product_id, quantity, price_at_purchase) VALUES ($1, $2, $3, $4)',
                [orderId, item.id, item.quantity, item.price]
            );
        }

        // В. ОТПРАВКА В TELEGRAM (DEBUG MODE)
        const tgToken = "8378003761:AAGAz1nRDSii9HZb0ZiOQUpY4VIMXQKUsas"; // Твой токен
const tgChatId = "8487400980"; // Твой ID

        // Логи в терминал сервера
        console.log("--- ПОПЫТКА ОТПРАВКИ В ТГ ---");
        console.log("Token есть?", tgToken ? "Да" : "НЕТ");
        console.log("Chat ID:", tgChatId);

        if (tgToken && tgChatId) {
            let message = `🚀 <b>Новый заказ #${orderId}!</b>\n\n`;
            message += `💰 Сумма: <b>${total_price} ₴</b>\n`;
            message += `👤 ID Клиента: ${user_id}\n\n`;
            message += `📦 <b>Товары:</b>\n`;
            
            items.forEach(item => {
                const color = item.selectedColor ? `(${item.selectedColor})` : '';
                message += `- ${item.title} ${color} — ${item.quantity} шт.\n`;
            });

            try {
                // Используем встроенный fetch (Node 18+)
                const tgRes = await fetch(`https://api.telegram.org/bot${tgToken}/sendMessage`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        chat_id: tgChatId,
                        text: message,
                        parse_mode: 'HTML'
                    })
                });
                
                const tgData = await tgRes.json();
                if (!tgRes.ok) {
                    console.error("❌ Ошибка Telegram API:", tgData);
                } else {
                    console.log("✅ Сообщение успешно отправлено в Telegram!");
                }
            } catch (tgErr) {
                console.error("❌ Ошибка сети при отправке в ТГ:", tgErr);
            }
        } else {
            console.log("⚠️ Telegram пропущен: нет токена или ID в .env");
        }

        res.json({ message: "Заказ успешно создан!", orderId });

    } catch (err) {
        console.error(err.message);
        res.status(500).send("Ошибка при создании заказа");
    }
});

// 6. ИСТОРИЯ ЗАКАЗОВ
app.get('/users/:id/orders', async (req, res) => {
    try {
        const { id } = req.params;
        const orders = await pool.query('SELECT * FROM orders WHERE user_id = $1 ORDER BY created_at DESC', [id]);
        res.json(orders.rows);
    } catch (err) {
        console.error(err.message);
        res.status(500).send("Ошибка сервера");
    }
});

// 7. АДМИН: ВСЕ ЗАКАЗЫ
app.get('/admin/orders', async (req, res) => {
    try {
        const query = `
            SELECT orders.*, users.full_name, users.email 
            FROM orders 
            JOIN users ON orders.user_id = users.id 
            ORDER BY orders.created_at DESC
        `;
        const result = await pool.query(query);
        res.json(result.rows);
    } catch (err) {
        console.error(err.message);
        res.status(500).send("Ошибка сервера");
    }
});

// 8. АДМИН: СМЕНА СТАТУСА
app.patch('/admin/orders/:id/status', async (req, res) => {
    try {
        const { id } = req.params;
        const { status } = req.body;
        await pool.query('UPDATE orders SET status = $1 WHERE id = $2', [status, id]);
        res.json({ message: "Статус обновлен" });
    } catch (err) {
        console.error(err.message);
        res.status(500).send("Ошибка сервера");
    }
});

// 9. КАРТЫ ЮЗЕРА
app.get('/users/:id/cards', async (req, res) => {
    try {
        const { id } = req.params;
        const cards = await pool.query('SELECT * FROM saved_cards WHERE user_id = $1', [id]);
        res.json(cards.rows);
    } catch (err) {
        console.error(err.message);
        res.status(500).send("Ошибка сервера");
    }
});

// 10. ДОБАВИТЬ КАРТУ (Ручное добавление)
app.post('/cards', async (req, res) => {
    try {
        const { user_id, number, brand } = req.body;
        const token = `tok_${Math.random().toString(36).substr(2)}`;
        const last4 = number.slice(-4);
        const newCard = await pool.query(
            'INSERT INTO saved_cards (user_id, last_4_digits, brand, token) VALUES ($1, $2, $3, $4) RETURNING *',
            [user_id, last4, brand, token]
        );
        res.json(newCard.rows[0]);
    } catch (err) {
        console.error(err.message);
        res.status(500).send("Ошибка сервера");
    }
});

// 11. УДАЛИТЬ КАРТУ
app.delete('/cards/:id', async (req, res) => {
    try {
        const { id } = req.params;
        await pool.query('DELETE FROM saved_cards WHERE id = $1', [id]);
        res.json({ message: "Карта удалена" });
    } catch (err) {
        console.error(err.message);
        res.status(500).send("Ошибка сервера");
    }
});

// 12. STRIPE (Оплата)
app.post('/create-payment-intent', async (req, res) => {
    try {
        const { amount } = req.body;
        const paymentIntent = await stripe.paymentIntents.create({
            amount: Math.round(amount * 100), // Округляем до целых копеек
            currency: 'uah',
            automatic_payment_methods: { enabled: true },
        });
        res.json({ clientSecret: paymentIntent.client_secret });
    } catch (err) {
        console.error(err.message);
        res.status(500).send("Ошибка платежной системы");
    }
});

// 13. ОБНОВИТЬ ПРОФИЛЬ
app.put('/users/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { full_name, avatar_url } = req.body;
        const updatedUser = await pool.query(
            'UPDATE users SET full_name = $1, avatar_url = $2 WHERE id = $3 RETURNING id, email, full_name, role, avatar_url',
            [full_name, avatar_url, id]
        );
        res.json(updatedUser.rows[0]);
    } catch (err) {
        console.error(err.message);
        res.status(500).send("Ошибка сервера");
    }
});

// 14. КОРЗИНА: СОХРАНИТЬ (Синхронизация)
app.put('/cart/:userId', async (req, res) => {
    try {
        const { userId } = req.params;
        const { cart } = req.body;
        await pool.query('DELETE FROM cart WHERE user_id = $1', [userId]);
        if (cart.length > 0) {
            for (const item of cart) {
                await pool.query(
                    'INSERT INTO cart (user_id, product_id, quantity) VALUES ($1, $2, $3)',
                    [userId, item.id, item.quantity]
                );
            }
        }
        res.json({ message: "Корзина синхронизирована" });
    } catch (err) {
        console.error(err.message);
        res.status(500).send("Ошибка сохранения корзины");
    }
});

// 15. КОРЗИНА: ПОЛУЧИТЬ
app.get('/cart/:userId', async (req, res) => {
    try {
        const { userId } = req.params;
        const query = `
            SELECT c.quantity, p.* FROM cart c
            JOIN products p ON c.product_id = p.id
            WHERE c.user_id = $1
        `;
        const result = await pool.query(query, [userId]);
        res.json(result.rows);
    } catch (err) {
        console.error(err.message);
        res.status(500).send("Ошибка получения корзины");
    }
});

// 16. КУПОНЫ
app.post('/coupons/validate', async (req, res) => {
    try {
        const { code } = req.body;
        const result = await pool.query('SELECT * FROM coupons WHERE code ILIKE $1 AND is_active = TRUE', [code]);
        if (result.rows.length === 0) return res.status(404).json({ message: "Купон не найден" });
        res.json(result.rows[0]);
    } catch (err) {
        console.error(err.message);
        res.status(500).send("Ошибка проверки купона");
    }
});

// 17. СМЕНА ПАРОЛЯ
app.put('/users/:id/password', async (req, res) => {
    try {
        const { id } = req.params;
        const { oldPassword, newPassword } = req.body;
        const user = await pool.query('SELECT password_hash FROM users WHERE id = $1', [id]);
        if (user.rows.length === 0) return res.status(404).json({ message: "Пользователь не найден" });

        const validPassword = await bcrypt.compare(oldPassword, user.rows[0].password_hash);
        if (!validPassword) return res.status(400).json({ message: "Старый пароль неверный" });

        const salt = await bcrypt.genSalt(10);
        const newHash = await bcrypt.hash(newPassword, salt);
        await pool.query('UPDATE users SET password_hash = $1 WHERE id = $2', [newHash, id]);
        res.json({ message: "Пароль успешно изменен" });
    } catch (err) {
        console.error(err.message);
        res.status(500).send("Ошибка смены пароля");
    }
});

// 18. ИЗБРАННОЕ: ДОБАВИТЬ
app.post('/favorites', async (req, res) => {
    try {
        const { user_id, product_id } = req.body;
        await pool.query('INSERT INTO favorites (user_id, product_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [user_id, product_id]);
        res.json({ message: "Добавлено в избранное" });
    } catch (err) { console.error(err); res.status(500).send("Ошибка сервера"); }
});

// 19. ИЗБРАННОЕ: УДАЛИТЬ
app.delete('/favorites/:userId/:productId', async (req, res) => {
    try {
        const { userId, productId } = req.params;
        await pool.query('DELETE FROM favorites WHERE user_id = $1 AND product_id = $2', [userId, productId]);
        res.json({ message: "Удалено из избранного" });
    } catch (err) { console.error(err); res.status(500).send("Ошибка сервера"); }
});

// 20. ИЗБРАННОЕ: СПИСОК
app.get('/favorites/:userId', async (req, res) => {
    try {
        const { userId } = req.params;
        const query = `SELECT p.* FROM favorites f JOIN products p ON f.product_id = p.id WHERE f.user_id = $1 ORDER BY f.created_at DESC`;
        const result = await pool.query(query, [userId]);
        res.json(result.rows);
    } catch (err) { console.error(err); res.status(500).send("Ошибка сервера"); }
});

// 21. ИЗБРАННОЕ: IDs
app.get('/favorites/ids/:userId', async (req, res) => {
    try {
        const { userId } = req.params;
        const result = await pool.query('SELECT product_id FROM favorites WHERE user_id = $1', [userId]);
        res.json(result.rows.map(row => row.product_id));
    } catch (err) { console.error(err); res.status(500).send("Ошибка сервера"); }
});

// Запуск
app.get('/', (req, res) => {
    res.send('API is running!');
});
app.listen(PORT, () => {
    console.log(`Server started on port ${PORT}`);
});
// ... (весь твой код выше)

app.listen(PORT, () => {
    console.log(`Server started on port ${PORT}`);
});

// === ЛОГИКА ТЕХПОДДЕРЖКИ (TELEGRAF) ===
const { Telegraf } = require('telegraf');

// Запускаем бота, только если есть токен
if (process.env.TG_BOT_TOKEN) {
    const bot = new Telegraf(process.env.TG_BOT_TOKEN);
    const ADMIN_ID = parseInt(process.env.TG_CHAT_ID); // Твой ID

    // 1. Когда клиент пишет боту (Любое сообщение)
    bot.on('message', async (ctx) => {
        // Если пишет Админ (ты)
        if (ctx.from.id === ADMIN_ID) {
            // Проверяем, является ли это ОТВЕТОМ на пересланное сообщение
            if (ctx.message.reply_to_message && ctx.message.reply_to_message.forward_from) {
                const clientId = ctx.message.reply_to_message.forward_from.id;
                
                // Копируем твой ответ клиенту
                try {
                    await ctx.copyMessage(clientId);
                    await ctx.reply("✅ Ответ отправлен клиенту!");
                } catch (e) {
                    await ctx.reply("❌ Не удалось отправить (возможно, клиент заблокировал бота)");
                }
            } else {
                // Если админ просто пишет, но не отвечает
                // ctx.reply("Чтобы ответить клиенту, сделайте Reply (Ответить) на его сообщение.");
            }
        } 
        // Если пишет Клиент
        else {
            // Пересылаем сообщение Админу
            await ctx.forwardMessage(ADMIN_ID);
        }
    });

    // Запуск прослушки
    bot.launch();
    console.log("🤖 Бот техподдержки запущен!");

    // Остановка при выключении сервера
    process.once('SIGINT', () => bot.stop('SIGINT'));
    process.once('SIGTERM', () => bot.stop('SIGTERM'));
}
