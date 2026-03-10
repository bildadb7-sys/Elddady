
import { Request, Response, NextFunction } from 'express';
import { SupabaseClient } from '@supabase/supabase-js';
import jwt from 'jsonwebtoken';

// Define User Interface based on JWT payload
interface AuthUser {
    id: string;
    aud?: string;
    role?: string;
    email?: string;
    app_metadata?: any;
    user_metadata?: any;
    exp?: number;
}

// --- IDOR PROTECTION (Broken Access Control) ---
// Factory function to create ownership checks efficiently
export const ensureOwnership = (
    tableName: string, 
    resourceIdParam: string = 'id', // The param name in req.params
    supabase: SupabaseClient
) => {
    return async (req: Request, res: Response, next: NextFunction) => {
        const user = (req as any).user as AuthUser;
        const resourceId = (req as any).params[resourceIdParam];

        if (!user || !user.id) {
            return (res as any).status(401).json({ error: 'Unauthorized' });
        }

        try {
            // Optimized Query: SELECT user_id FROM table WHERE id = ?
            // We do NOT select * to save bandwidth and DB I/O
            const { data, error } = await supabase
                .from(tableName)
                .select('owner_id') // Assuming 'owner_id' or 'user_id' is the column
                .eq('id', resourceId)
                .single();

            if (error || !data) {
                return (res as any).status(404).json({ error: 'Resource not found' });
            }

            // Strict Check
            if (data.owner_id !== user.id) {
                console.warn(`[Security] IDOR Attempt: User ${user.id} tried to access ${tableName}:${resourceId}`);
                return (res as any).status(403).json({ error: 'Forbidden' });
            }

            next();
        } catch (err) {
            console.error('IDOR Check Error:', err);
            return (res as any).status(500).json({ error: 'Internal Server Error' });
        }
    };
};

// --- JWT AUTHENTICATION ---
export const verifyToken = (req: Request, res: Response, next: NextFunction) => {
    const authHeader = req.headers.authorization;

    if (!authHeader) {
        return (res as any).status(401).json({ error: 'Authorization header missing' });
    }

    const token = authHeader.split(' ')[1];
    if (!token) {
        return (res as any).status(401).json({ error: 'Bearer token missing' });
    }

    // --- PRODUCTION SECURITY ENFORCEMENT ---
    try {
        const secret = process.env.SUPABASE_JWT_SECRET || process.env.JWT_SECRET;
        
        if (!secret) {
            console.error("FATAL: SUPABASE_JWT_SECRET is not set in environment variables.");
            return (res as any).status(500).json({ error: 'Server misconfiguration: Auth Secret missing' });
        }

        // Verify the token cryptographically.
        // This ensures the token was signed by Supabase and hasn't been tampered with.
        const decoded = jwt.verify(token, secret);
        
        // Supabase stores user ID in 'sub'
        (req as any).user = { ...(decoded as any), id: (decoded as any).sub };
        
        next();
    } catch (err) {
        console.error("JWT Verification Failed:", err);
        return (res as any).status(403).json({ error: 'Invalid or expired token' });
    }
};
