
import 'dotenv/config';
import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';
import Redis from 'ioredis';
import { body, param, validationResult } from 'express-validator';
import { securityHeaders, hppMiddleware, jsonBodyParser } from './middleware/security.js';
import { createRateLimiter } from './middleware/rateLimiter.js';
import { verifyToken, ensureOwnership } from './middleware/auth.js';

// NLP Imports (Dynamic/Resilient)
import winkNLP from 'wink-nlp';
import model from 'wink-eng-lite-web-model';

const PORT = 5000;
const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_APP_SUPABASE_URL || 'https://yssenbdybuxoujfsuyjv.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || process.env.VITE_APP_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inlzc2VuYmR5YnV4b3VqZnN1eWp2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE5MzAyNDcsImV4cCI6MjA4NzUwNjI0N30.7STUrJ4gGYH_IGiHx0syiEIUDsZ0u1Xd8BFMW5ux7Cc'; 

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

// Redis Setup with Fail-Open Strategy
let redis: Redis | null = null;
try {
    redis = new Redis(REDIS_URL, { 
        lazyConnect: true,
        maxRetriesPerRequest: 1,
        retryStrategy: (times) => {
            if (times > 3) return null; // Stop retrying after 3 attempts
            return Math.min(times * 50, 2000);
        }
    });
    redis.on('error', (err) => {
        // Suppress connection errors to keep console clean in dev
    });
    redis.connect().then(() => console.log("🚀 Redis Connected: Security & Ingestor Active")).catch(() => console.warn("⚠️ Redis Connection Failed - Security/Ingestor falling back to memory/bypass"));
} catch (e) {
    console.warn("Redis initialization failed");
}

// --- EXCHANGE RATE UPDATER ---
const updateExchangeRates = async () => {
    const API_KEY = process.env.EXCHANGE_RATE_API_KEY;
    if (!API_KEY) {
        console.warn("⚠️ EXCHANGE_RATE_API_KEY is not set. Skipping live exchange rate update.");
        return;
    }
    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
        console.warn("⚠️ SUPABASE_SERVICE_ROLE_KEY is not set. Skipping live exchange rate update to avoid RLS errors. Please add it to your .env file.");
        return;
    }
    console.log("🔄 Fetching Live Rates from ExchangeRate-API...");
    try {
        const res = await fetch(`https://v6.exchangerate-api.com/v6/${API_KEY}/latest/USD`);
        const data = await res.json();
        
        if (data.result !== 'success') {
            throw new Error(`API Error: ${data['error-type']}`);
        }

        const rates = data.conversion_rates;
        const currencyCodes = Object.keys(rates);
        
        console.log(`✅ Fetched ${currencyCodes.length} currencies.`);

        const payload = currencyCodes.map(code => ({
            code: code,
            rate_to_usd: rates[code],
            last_updated: new Date().toISOString()
        }));

        const { error } = await supabase
            .from('currencies')
            .upsert(payload, { onConflict: 'code' });

        if (error) {
            throw error;
        }
        console.log("💾 Successfully cached rates to Supabase.");
    } catch (err: any) {
        console.error("❌ Failed to update rates:", err.message);
    }
};

// Run on startup and every hour
updateExchangeRates();
setInterval(updateExchangeRates, 60 * 60 * 1000);

// --- MIDDLEWARE STACK ---
app.use(securityHeaders); // Helmet CSP & Headers
app.use(cors()); // CORS
app.use(jsonBodyParser as any); // Body Parser with Limits
app.use(hppMiddleware); // HTTP Parameter Pollution
// Removed global sanitizer; using express-validator per route
app.use(createRateLimiter(redis)); // Rate Limiting

// --- HELPER: Validation Check ---
const validate = (req: Request, res: Response, next: NextFunction) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return (res as any).status(400).json({ errors: errors.array() });
    }
    next();
};

// --- HELPER: Heuristic Tag Generator ---
const generateHeuristicTags = (text: string) => {
    const stopWords = new Set(["the", "and", "is", "in", "it", "with", "for", "to", "of", "a", "an", "this", "that"]);
    const words = text.toLowerCase().replace(/[^\w\s]/g, '').split(/\s+/);
    const tags = new Map<string, number>();
    
    words.forEach(w => {
        if (w.length > 3 && !stopWords.has(w)) {
            tags.set(w, (tags.get(w) || 0) + 1);
        }
    });
    
    return Array.from(tags.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([tag, count]) => ({ tag, weight: count }));
};

// --- ROUTES ---

// 1. Tag Generation Engine
// Uses NLP to extract nouns and adjectives, weighting them by frequency.
app.post('/api/tags/suggest',
    [
        body('description').trim().escape().isString().isLength({ max: 5000 }).withMessage('Description too long')
    ],
    validate,
    (req: Request, res: Response) => {
        const { description } = req.body;
        if (!description) return (res as any).json({ tags: [] });

        try {
            if (nlp) {
                const doc = nlp.readDocument(description);
                // Extract nouns and adjectives as they are good candidates for tags
                const nouns = doc.nouns().out(nlp.its.frequency());
                const adjectives = doc.adjectives().out(nlp.its.frequency());
                
                // Combine and sort
                // Note: wink-nlp frequency output is array of [term, count]
                const combined = [...nouns, ...adjectives]
                    .map((item: any) => ({ tag: item[0], weight: Math.ceil(item[1] * 5) })) // Scale weight
                    .sort((a: any, b: any) => b.weight - a.weight) // Sort by weight
                    .slice(0, 10); // Top 10
                
                // Deduplicate
                const uniqueTags = new Map();
                combined.forEach((t: any) => {
                    if(!uniqueTags.has(t.tag)) uniqueTags.set(t.tag, t);
                });

                return (res as any).json({ tags: Array.from(uniqueTags.values()) });
            } else {
                throw new Error("NLP not available");
            }
        } catch (e) {
            // Fallback
            const tags = generateHeuristicTags(description);
            return (res as any).json({ tags });
        }
    }
);

// 2. Feed Recommendation Engine
// Logic: Find products with overlapping tags to the source product.
// This runs on the server to offload complex filtering logic from the client.
app.post('/api/recommendations',
    [
        body('productId').trim().escape().notEmpty().withMessage('Product ID is required')
    ],
    validate,
    async (req: Request, res: Response) => {
        const { productId } = req.body;

        try {
            // A. Fetch Source Product Tags
            const { data: sourceProduct, error: srcError } = await supabase
                .from('products')
                .select('tags, category')
                .eq('id', productId)
                .single();

            if (srcError || !sourceProduct) throw new Error("Product not found");

            const sourceTags = (sourceProduct.tags as any[]) || [];
            const sourceCategory = sourceProduct.category;

            // B. Fetch Candidates (Optimization: Filter by Category first to reduce search space)
            // We fetch 50 candidates to score.
            const { data: candidates, error: candError } = await supabase
                .from('products')
                .select('id, tags')
                .eq('category', sourceCategory)
                .neq('id', productId)
                .limit(50);

            if (candError) throw candError;

            // C. Score Candidates
            // Algorithm: Weighted Tag Intersection
            const scoredCandidates = (candidates || []).map((cand: any) => {
                let score = 0;
                const candTags = (cand.tags as any[]) || [];
                
                candTags.forEach((ct: any) => {
                    const match = sourceTags.find((st: any) => st.tag === ct.tag);
                    if (match) {
                        // Score = sum of (sourceWeight * candidateWeight)
                        score += (match.weight || 1) * (ct.weight || 1);
                    }
                });
                return { id: cand.id, score };
            });

            // D. Sort and Pick Top Results
            const topProductIds = scoredCandidates
                .filter((c: any) => c.score > 0)
                .sort((a: any, b: any) => b.score - a.score)
                .slice(0, 5) // Top 5 Recommendations
                .map((c: any) => c.id);

            if (topProductIds.length === 0) {
                return (res as any).json({ posts: [] });
            }

            // E. Fetch Posts for Top Products
            const { data: posts, error: postError } = await supabase
                .from('posts')
                .select(`
                    *,
                    user:profiles!user_id(*),
                    product:products!product_id(
                        *,
                        product_likes(user_id),
                        bookmarks(user_id)
                    )
                `)
                .in('product_id', topProductIds);

            if (postError) throw postError;

            // F. Format Response (Mapper Logic)
            // We map roughly to frontend format here or let frontend do it. 
            // Ideally server returns raw data, frontend maps. 
            // But to keep consistency with api.ts mapping, we return the data structure Supabase returns.
            (res as any).json({ posts: posts || [] });

        } catch (e: any) {
            console.error("[Recommendation Engine Error]", e.message);
            (res as any).status(500).json({ error: "Recommendation failed", posts: [] });
        }
    }
);

// 3. High-Frequency View Ingestor (Redis Buffered)
app.post('/api/vrooms/:id/view',
    [
        param('id').trim().escape().notEmpty(),
        body('userId').optional().trim().escape()
    ],
    validate,
    async (req: Request, res: Response) => {
        const vroomId = (req as any).params.id;
        const userId = (req as any).body?.userId || (req as any).ip; 
        
        const key = `view:${vroomId}:${userId}`;
        
        try {
            if (redis && redis.status === 'ready') {
                // Atomic check: If key exists, user viewed recently (dedup)
                const exists = await redis.get(key);
                if (exists) {
                    return (res as any).json({ success: true, counted: false });
                }

                // Set with Expiry (1 hour)
                await redis.set(key, '1', 'EX', 3600);
                
                // Increment Buffer (Aggregator worker would flush this to Postgres)
                // For prototype, we verify connectivity then write to DB directly async
                // In high-scale, this would just incr a Redis counter
                supabase.rpc('increment_vroom_views', { vroom_uuid: vroomId }).then(() => {});
            } else {
                // Redis down, write directly to DB (slower but safe)
                await supabase.rpc('increment_vroom_views', { vroom_uuid: vroomId });
            }

            (res as any).json({ success: true, counted: true });
        } catch (e) {
            console.error("View count error", e);
            // Fail Open: Don't block the client for metrics errors
            (res as any).status(200).json({ success: true }); 
        }
    }
);

// 4. Admin: Ban User (Secure)
app.post('/api/admin/ban-user', 
    verifyToken,
    [
        body('targetUserId').trim().escape().notEmpty().withMessage('Target User ID required')
    ],
    validate,
    async (req: Request, res: Response) => {
        const adminId = (req as any).user?.id;
        if (!adminId) return (res as any).status(401).send("Unauthorized");

        // Double check admin status in DB
        const { data: admin } = await supabase.from('profiles').select('is_admin').eq('id', adminId).single();
        if (!admin?.is_admin) return (res as any).status(403).send("Forbidden");

        const { targetUserId } = (req as any).body;
        
        // Update Profile Status
        const { error: profileError } = await supabase.from('profiles').update({ status: 'banned' }).eq('id', targetUserId);
        if (profileError) return (res as any).status(500).json({ error: profileError.message });

        // Ban in Auth System (Requires Service Role Key)
        const { error: authError } = await supabase.auth.admin.updateUserById(targetUserId, { user_metadata: { banned: true }, ban_duration: "876000h" }); // ~100 years
        
        if (authError) {
            console.error("Auth ban failed", authError);
            return (res as any).status(500).json({ error: authError.message });
        }

        (res as any).json({ success: true });
    }
);

// Health Check
app.get('/health', (req, res) => {
    (res as any).send('Eldady API Service Operational');
});

app.listen(PORT, () => console.log(`Production Service running on port ${PORT}`));
