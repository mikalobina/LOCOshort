require('dotenv').config(); // .env ফাইল থেকে ভেরিয়েবল লোড করার জন্য

const express = require('express');
const bodyParser = require('body-parser');
const session = require('express-session');
const MongoStore = require('connect-mongo');
const useragent = require('useragent');
const requestIp = require('request-ip');
const path = require('path');
const crypto = require('crypto');
const { MongoClient } = require('mongodb');
const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));

const app = express();
const PORT = process.env.PORT || 3000;

// --- MongoDB Connection ---
const client = new MongoClient(process.env.MONGO_URI);
let linksCollection, logsCollection;

async function connectToDb() {
  try {
    await client.connect();
    console.log("Successfully connected to MongoDB.");
    const db = client.db("locoshort");
    linksCollection = db.collection("links");
    logsCollection = db.collection("logs");
  } catch (err) {
    console.error("Failed to connect to MongoDB", err);
    process.exit(1);
  }
}

const ADMIN_USER = {
  username: 'shuddho',
  password: '10101010'
};

// --- Middleware ---
app.use(express.static('public'));
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(requestIp.mw());

// Session Middleware (MongoDB Store)
app.use(
  session({
    secret: 'a-very-strong-secret-key-for-shuddho',
    resave: false,
    saveUninitialized: false,
    store: MongoStore.create({
      mongoUrl: process.env.MONGO_URI,
      ttl: 14 * 24 * 60 * 60 // 14 days
    }),
    cookie: {
      maxAge: 14 * 24 * 60 * 60 * 1000 // 14 days
    }
  })
);

function checkAuth(req, res, next) {
  if (req.session.isAuthenticated) return next();
  res.redirect('/login');
}

// --- Routes ---
app.get('/', (req, res) => res.redirect('/login'));
app.get('/login', (req, res) => res.sendFile(path.join(__dirname, 'views/login.html')));

app.post('/login', (req, res) => {
  if (req.body.username === ADMIN_USER.username && req.body.password === ADMIN_USER.password) {
    req.session.isAuthenticated = true;
    res.redirect('/admin');
  } else {
    res.send('Incorrect username or password. <a href="/login">Try again</a>.');
  }
});

app.get('/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/login'));
});

app.get('/admin', checkAuth, (req, res) => res.sendFile(path.join(__dirname, 'views/dashboard.html')));

app.get('/api/logs', checkAuth, async (req, res) => {
  const logs = await logsCollection.find().sort({ _id: -1 }).toArray();
  res.json(logs);
});

app.post('/create', checkAuth, async (req, res) => {
  const { url } = req.body;
  if (!url) return res.status(400).send('URL cannot be empty.');

  const id = crypto.randomBytes(4).toString('hex');
  await linksCollection.insertOne({ _id: id, originalUrl: url });

  const shortUrl = `${req.protocol}://${req.get('host')}/${id}`;
  res.redirect(`/admin?newLink=${encodeURIComponent(shortUrl)}`);
});

app.get('/:id', async (req, res) => {
  const { id } = req.params;
  if (id.includes('.')) return res.status(404).send();

  const link = await linksCollection.findOne({ _id: id });
  if (link) {
    res.sendFile(path.join(__dirname, 'views/redirect.html'));
  } else {
    res.status(404).send('Link not found.');
  }
});

app.post('/track/:id', async (req, res) => {
  const { id } = req.params;
  const { latitude, longitude } = req.body;
  const userAgentString = req.headers['user-agent'];
  const agent = useragent.parse(userAgentString);
  const ip = req.clientIp;
  let deviceName = agent.device.family;
  if (deviceName === 'Other' || !deviceName) {
      const match = userAgentString.match(/\(([^;]+);/);
      deviceName = match ? match[1] : agent.toString();
  }

  const logEntry = {
    linkId: id,
    ip,
    location: {
      lat: latitude || 'N/A',
      lon: longitude || 'N/A',
      address: 'Unavailable',
      mapLink: null
    },
    device: deviceName,
    browser: agent.family,
    os: agent.os.family,
    timestamp: new Date().toLocaleString('en-US', { timeZone: 'Asia/Dhaka' }),
    createdAt: new Date()
  };

  if (latitude && longitude) {
    logEntry.location.mapLink = `https://www.google.com/maps/search/?api=1&query=${latitude},${longitude}`;
    try {
      const geoResponse = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}`);
      const geoData = await geoResponse.json();
      if (geoData && geoData.address) {
        logEntry.location.address = [geoData.address.city, geoData.address.state, geoData.address.country].filter(Boolean).join(', ');
      }
    } catch (error) {
      console.error("Reverse geocoding failed:", error);
    }
  }

  await logsCollection.insertOne(logEntry);
  const link = await linksCollection.findOne({ _id: id });
  if (link) {
    res.json({ originalUrl: link.originalUrl });
  } else {
    res.status(404).json({ error: 'Link data not found after tracking.' });
  }
});

// --- Start Server ---
connectToDb().then(() => {
  app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
  });
});