import 'dotenv/config';
import express, { Request, Response } from 'express';
import cors from 'cors';
import { createClient } from '@supabase/supabase-js';
import Redis from 'ioredis';
import { securityHeaders, jsonBodyParser, hppMiddleware, createRateLimiter } from '../server-universal';
import winkNLP from 'wink-nlp';
import model from 'wink-eng-lite-web-model';

// Vercel Environment
const PORT = process.env.PORT || 5000;
const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://yssenbdybuxoujfsuyjv.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inlzc2VuYmR5YnV4b3VqZnN1eWp2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE5MzAyNDcsImV4cCI6MjA4NzUwNjI0N30.7STUrJ4gGYH_IGiHx0syiEIUDsZ0u1Xd8BFMW5ux7Cc';

const app = express();
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// NLP Setup
let nlp: any = null;
try {
    nlp = winkNLP(model);
    console.log("✅ NLP Engine Initialized");
} catch (e) {
    console.warn("⚠️ NLP Engine Failed to Load. Using heuristic fallback.");
}

// Redis Setup
let redis: Redis | null = null;
try {
    redis = new Redis(REDIS_URL);
    redis.on('error', () => {}); // Suppress errors in serverless
} catch (e) {
    console.warn("⚠️ Redis not available in serverless");
}

// Middleware
app.use(securityHeaders);
app.use(cors({
    origin: ['https://eldady.vercel.app', 'https://your-domain.vercel.app'],
    credentials: true
}));
app.use(jsonBodyParser);
app.use(hppMiddleware);
app.use(createRateLimiter(redis));

// Health Check
app.get('/health', (req, res) => {
    res.json({ 
        status: 'operational',
        environment: 'vercel-serverless',
        timestamp: new Date().toISOString()
    });
});

// API Routes - Key endpoints for messaging
app.get('/api/conversations', async (req, res) => {
    try {
        const { data: { user } } = await supabase.auth.getUser(req.headers.authorization?.replace('Bearer ', ''));
        if (!user) return res.status(401).json({ error: 'Unauthorized' });

        const { data } = await supabase
            .from('conversations')
            .select('*, participants:conversation_participants(user:profiles(*)), messages:messages(*, sender:profiles(*))')
            .in(`(${req.query.id?.split(',')})`)
            .order('last_message_at', { ascending: false });

        res.json(data);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/conversations', async (req, res) => {
    try {
        const { data: { user } } = await supabase.auth.getUser(req.headers.authorization?.replace('Bearer ', ''));
        if (!user) return res.status(401).json({ error: 'Unauthorized' });

        const { data, error } = await supabase
            .from('conversations')
            .insert({
                is_group: req.body.is_group,
                group_name: req.body.group_name,
                group_photo: req.body.group_photo,
                owner_id: user.id
            })
            .select()
            .single();

        if (error) throw error;

        // Add participants
        if (req.body.participants) {
            const participants = [user.id, ...req.body.participants].map(uid => ({ 
                conversation_id: data.id, 
                user_id: uid 
            }));
            await supabase.from('conversation_participants').insert(participants);
        }

        res.json(data);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/messages', async (req, res) => {
    try {
        const { data: { user } } = await supabase.auth.getUser(req.headers.authorization?.replace('Bearer ', ''));
        if (!user) return res.status(401).json({ error: 'Unauthorized' });

        const { data, error } = await supabase
            .from('messages')
            .insert({
                conversation_id: req.body.conversation_id,
                sender_id: user.id,
                content: req.body.content,
                image_url: req.body.image_url,
                reply_to_id: req.body.reply_to_id
            })
            .select()
            .single();

        if (error) throw error;

        // Update conversation timestamp
        await supabase
            .from('conversations')
            .update({ last_message_at: new Date().toISOString() })
            .eq('id', req.body.conversation_id);

        res.json(data);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Get all users for chat creation
app.get('/api/users', async (req, res) => {
    try {
        const { data } = await supabase
            .from('profiles')
            .select('*')
            .neq('id', (await supabase.auth.getUser(req.headers.authorization?.replace('Bearer ', '')))?.data?.user?.id);

        res.json(data);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Export for Vercel
export default app;
