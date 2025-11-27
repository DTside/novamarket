require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');

const app = express();

app.use(cors());
app.use(express.json());

// --- ПОДКЛЮЧЕНИЕ К БАЗЕ ДАННЫХ (Supabase) ---
const pool = new Pool({
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  database: process.env.DB_NAME,
  ssl: { rejectUnauthorized: false },
});

// --- РОУТЫ ---

app.get('/', (req, res) => {
    res.send('API connected to Supabase Database! 🚀');
});

// 1. Получить ВСЕ товары из Базы Данных
app.get('/api/products', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM products');
        
        // Превращаем данные из Базы в вид, удобный для Фронтенда
        const formattedProducts = result.rows.map(row => ({
            id: row.id,
            // В базе у тебя может быть колонка title или name. Проверяем обе:
            title: row.title || row.name || 'Товар без названия', 
            price: parseFloat(row.price), // Убеждаемся, что цена - это число
            description: row.text || row.description, // В базе колонка text
            // Самое главное: берем image_url из базы и кладем в image
            image: row.image_url, 
            category: row.category
        }));

        res.json(formattedProducts);
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Ошибка получения товаров" });
    }
});

// 2. Получить ОДИН товар по ID из Базы
app.get('/api/products/:id', async (req, res) => {
    const { id } = req.params;
    try {
        const result = await pool.query('SELECT * FROM products WHERE id = $1', [id]);
        
        if (result.rows.length === 0) {
            return res.status(404).json({ message: 'Товар не найден' });
        }

        const row = result.rows[0];
        const product = {
            id: row.id,
            title: row.title || row.name || 'Товар без названия',
            price: parseFloat(row.price),
            description: row.text || row.description,
            image: row.image_url, // Маппинг ссылки
            category: row.category
        };

        res.json(product);
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Ошибка сервера" });
    }
});

// --- ЗАПУСК ---
const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
    console.log(`Server started on port ${PORT}`);
});