require('dotenv').config();
const express = require('express');
const cors = require('cors');

const app = express();

app.use(cors());
app.use(express.json());

// --- БАЗА ТОВАРОВ (6 штук) ---
// Я добавил поля image, img, imageUrl и photo одновременно, 
// чтобы фронтенд точно увидел картинку, как бы он её ни называл.
const products = [
    { 
        id: 1, 
        title: 'Iphone 15', 
        price: 999, 
        description: 'Titanium design, A16 Bionic chip.',
        image: 'https://images.unsplash.com/photo-1696446701796-da61225697cc?auto=format&fit=crop&q=80&w=600',
        img: 'https://images.unsplash.com/photo-1696446701796-da61225697cc?auto=format&fit=crop&q=80&w=600',
        imageUrl: 'https://images.unsplash.com/photo-1696446701796-da61225697cc?auto=format&fit=crop&q=80&w=600',
        photo: 'https://images.unsplash.com/photo-1696446701796-da61225697cc?auto=format&fit=crop&q=80&w=600'
    },
    { 
        id: 2, 
        title: 'Samsung S24', 
        price: 899, 
        description: 'Galaxy AI is here.',
        image: 'https://images.unsplash.com/photo-1706698614275-9c24a646c2f3?auto=format&fit=crop&q=80&w=600',
        img: 'https://images.unsplash.com/photo-1706698614275-9c24a646c2f3?auto=format&fit=crop&q=80&w=600',
        imageUrl: 'https://images.unsplash.com/photo-1706698614275-9c24a646c2f3?auto=format&fit=crop&q=80&w=600',
        photo: 'https://images.unsplash.com/photo-1706698614275-9c24a646c2f3?auto=format&fit=crop&q=80&w=600'
    },
    { 
        id: 3, 
        title: 'MacBook Air', 
        price: 1200, 
        description: 'Supercharged by M3.',
        image: 'https://images.unsplash.com/photo-1517336714731-489689fd1ca4?auto=format&fit=crop&q=80&w=600',
        img: 'https://images.unsplash.com/photo-1517336714731-489689fd1ca4?auto=format&fit=crop&q=80&w=600',
        imageUrl: 'https://images.unsplash.com/photo-1517336714731-489689fd1ca4?auto=format&fit=crop&q=80&w=600',
        photo: 'https://images.unsplash.com/photo-1517336714731-489689fd1ca4?auto=format&fit=crop&q=80&w=600'
    },
    { 
        id: 4, 
        title: 'Sony WH-1000XM5', 
        price: 349, 
        description: 'Noise canceling headphones.',
        image: 'https://images.unsplash.com/photo-1618366712010-f4ae9c647dcb?auto=format&fit=crop&q=80&w=600',
        img: 'https://images.unsplash.com/photo-1618366712010-f4ae9c647dcb?auto=format&fit=crop&q=80&w=600',
        imageUrl: 'https://images.unsplash.com/photo-1618366712010-f4ae9c647dcb?auto=format&fit=crop&q=80&w=600',
        photo: 'https://images.unsplash.com/photo-1618366712010-f4ae9c647dcb?auto=format&fit=crop&q=80&w=600'
    },
    { 
        id: 5, 
        title: 'Apple Watch Ultra', 
        price: 799, 
        description: 'Adventure awaits.',
        image: 'https://images.unsplash.com/photo-1664713815297-9097ce1c54b6?auto=format&fit=crop&q=80&w=600',
        img: 'https://images.unsplash.com/photo-1664713815297-9097ce1c54b6?auto=format&fit=crop&q=80&w=600',
        imageUrl: 'https://images.unsplash.com/photo-1664713815297-9097ce1c54b6?auto=format&fit=crop&q=80&w=600',
        photo: 'https://images.unsplash.com/photo-1664713815297-9097ce1c54b6?auto=format&fit=crop&q=80&w=600'
    },
    { 
        id: 6, 
        title: 'PlayStation 5', 
        price: 499, 
        description: 'Play Has No Limits.',
        image: 'https://images.unsplash.com/photo-1606144042614-b2417e99c4e3?auto=format&fit=crop&q=80&w=600',
        img: 'https://images.unsplash.com/photo-1606144042614-b2417e99c4e3?auto=format&fit=crop&q=80&w=600',
        imageUrl: 'https://images.unsplash.com/photo-1606144042614-b2417e99c4e3?auto=format&fit=crop&q=80&w=600',
        photo: 'https://images.unsplash.com/photo-1606144042614-b2417e99c4e3?auto=format&fit=crop&q=80&w=600'
    }
];

// --- РОУТЫ ---

app.get('/', (req, res) => {
    res.send('API is working with images!');
});

// Получить ВСЕ товары
app.get('/api/products', (req, res) => {
    res.json(products);
});

// Получить ОДИН товар
app.get('/api/products/:id', (req, res) => {
    const id = parseInt(req.params.id);
    const product = products.find(p => p.id === id);
    if (product) {
        res.json(product);
    } else {
        res.status(404).json({ message: 'Товар не найден' });
    }
});

// --- ЗАПУСК ---
const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
    console.log(`Server started on port ${PORT}`);
});